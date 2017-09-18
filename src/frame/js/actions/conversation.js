import { batchActions } from 'redux-batched-actions';

import { showErrorNotification, setShouldScrollToBottom, setFetchingMoreMessages as setFetchingMoreMessagesUi, showConnectNotification } from './app-state';
import { getUserId, updateUser, immediateUpdate } from './user';
import { disconnectClient, subscribeConversation, subscribeUser, subscribeConversationActivity, unsetFayeSubscriptions } from './faye';

import { core } from '../utils/core';
import { observable } from '../utils/events';
import { Throttle } from '../utils/throttle';
import { resizeImage, getBlobFromDataUrl, isFileTypeSupported } from '../utils/media';
import { getDeviceId } from '../utils/device';
import { hasLinkableChannels, getLinkableChannels, isChannelLinked } from '../utils/user';
import { getWindowLocation } from '../utils/dom';
import { CONNECT_NOTIFICATION_DELAY_IN_SECONDS } from '../constants/notifications';
import { SEND_STATUS, LOCATION_ERRORS } from '../constants/message';

export const ADD_MESSAGE = 'ADD_MESSAGE';
export const ADD_MESSAGES = 'ADD_MESSAGES';
export const REPLACE_MESSAGE = 'REPLACE_MESSAGE';
export const REMOVE_MESSAGE = 'REMOVE_MESSAGE';
export const RESET_CONVERSATION = 'RESET_CONVERSATION';
export const SET_CONVERSATION = 'SET_CONVERSATION';
export const SET_MESSAGES = 'SET_MESSAGES';
export const RESET_UNREAD_COUNT = 'RESET_UNREAD_COUNT';
export const INCREMENT_UNREAD_COUNT = 'INCREMENT_UNREAD_COUNT';
export const SET_FETCHING_MORE_MESSAGES_FROM_SERVER = 'SET_FETCHING_MORE_MESSAGES_FROM_SERVER';


export function resetConversation() {
    return {
        type: RESET_CONVERSATION
    };
}

export function setConversation(props) {
    return {
        type: SET_CONVERSATION,
        conversation: props
    };
}

export function setMessages(messages) {
    return {
        type: SET_MESSAGES,
        messages
    };
}


export function addMessages(messages, append = true) {
    return {
        type: ADD_MESSAGES,
        messages,
        append
    };
}

export function replaceMessage(queryProps, message) {
    return {
        type: REPLACE_MESSAGE,
        queryProps,
        message
    };
}

export function incrementUnreadCount() {
    return {
        type: INCREMENT_UNREAD_COUNT
    };
}

export function setFetchingMoreMessagesFromServer(value) {
    return {
        type: SET_FETCHING_MORE_MESSAGES_FROM_SERVER,
        value
    };
}

// Throttle requests per appUser
const throttleMap = {};
const throttlePerUser = (userId) => {
    if (!throttleMap[userId]) {
        throttleMap[userId] = new Throttle();
    }

    return throttleMap[userId];
};

function postSendMessage(message) {
    return (dispatch, getState) => {
        return core(getState()).appUsers.sendMessage(getUserId(getState()), message);
    };
}

function postUploadImage(message) {
    return (dispatch, getState) => {
        const blob = getBlobFromDataUrl(message.mediaUrl);

        return core(getState()).appUsers.uploadImage(getUserId(getState()), blob, {
            role: 'appUser',
            deviceId: getDeviceId()
        });
    };
}

function onMessageSendSuccess(message, response) {
    return (dispatch, getState) => {
        const actions = [];
        const {user} = getState();

        if (!user.conversationStarted) {
            // use setConversation to set the conversation id in the store
            actions.push(setConversation(response.conversation));
            actions.push(updateUser({
                conversationStarted: true
            }));
        }

        actions.push(setShouldScrollToBottom(true));
        actions.push(replaceMessage({
            _clientId: message._clientId
        }, response.message));

        dispatch(batchActions(actions));
        observable.trigger('message:sent', response.message);

        return response;
    };
}

function onMessageSendFailure(message) {
    return (dispatch) => {
        const actions = [];
        message.sendStatus = SEND_STATUS.FAILED;

        actions.push(setShouldScrollToBottom(true));
        actions.push(replaceMessage({
            _clientId: message._clientId
        }, message));

        dispatch(batchActions(actions));
    };
}

function addMessage(props) {
    return (dispatch, getState) => {
        if (props._clientId) {
            const oldMessage = getState().conversation.messages.find((message) => message._clientId === props._clientId);
            const newMessage = Object.assign({}, oldMessage, props);

            dispatch(replaceMessage({
                _clientId: props._clientId
            }, newMessage));

            return newMessage;
        }

        const message = {
            type: 'text',
            role: 'appUser',
            _clientId: Math.random(),
            _clientSent: Date.now() / 1000,
            deviceId: getDeviceId(),
            sendStatus: SEND_STATUS.SENDING
        };

        if (typeof props === 'string') {
            message.text = props;
        } else {
            Object.assign(message, props);
        }

        dispatch(batchActions([
            setShouldScrollToBottom(true),
            {
                type: ADD_MESSAGE,
                message
            }
        ]));

        return message;
    };
}


function removeMessage(_clientId) {
    return (dispatch) => {
        dispatch(batchActions([
            setShouldScrollToBottom(true),
            {
                type: REMOVE_MESSAGE,
                queryProps: {
                    _clientId
                }
            }
        ]));
    };
}

function _getMessages(dispatch, getState) {
    const userId = getUserId(getState());
    return core(getState()).appUsers.getMessages(userId).then((response) => {
        dispatch(batchActions([
            setConversation({
                ...response.conversation,
                hasMoreMessages: !!response.previous
            }),
            setMessages(response.messages)
        ]));
        return response;
    });
}

function sendChain(sendFn, message) {
    return (dispatch, getState) => {
        const promise = dispatch(immediateUpdate(getState().user));

        const postSendHandler = (response) => {
            return Promise.resolve(dispatch(onMessageSendSuccess(message, response)))
                .then(() => dispatch(handleConnectNotification(response)))
                .then(() => dispatch(connectFayeConversation()))
                .catch(); // swallow errors to avoid uncaught promises bubbling up
        };

        return promise
            .then(() => {
                return dispatch(sendFn(message))
                    .then(postSendHandler)
                    .catch(() => dispatch(onMessageSendFailure(message)));
            });
    };
}

export function sendMessage(props) {
    return (dispatch) => {
        const message = dispatch(addMessage(props));
        return dispatch(sendChain(postSendMessage, message));
    };
}

export function postPostback(actionId) {
    return (dispatch, getState) => {
        return core(getState()).conversations.postPostback(getUserId(getState()), actionId)
            .catch(() => {
                dispatch(showErrorNotification(getState().ui.text.actionPostbackError));
            });
    };
}

export function fetchMoreMessages() {
    return (dispatch, getState) => {
        const {conversation: {hasMoreMessages, messages, isFetchingMoreMessagesFromServer}} = getState();

        if (!hasMoreMessages || isFetchingMoreMessagesFromServer) {
            return Promise.resolve();
        }

        const timestamp = messages[0].received;
        dispatch(setFetchingMoreMessagesFromServer(true));
        return core(getState()).appUsers.getMessages(getUserId(getState()), {
            before: timestamp
        }).then((response) => {
            dispatch(batchActions([
                setConversation({
                    ...response.conversation,
                    hasMoreMessages: !!response.previous
                }),
                addMessages(response.messages, false),
                setFetchingMoreMessagesFromServer(false),
                setFetchingMoreMessagesUi(false)
            ]));
            return response;
        });
    };
}

export function handleConnectNotification(response) {
    return (dispatch, getState) => {
        const {user: {clients}, app: {integrations, settings}, conversation: {messages}} = getState();
        const appUserMessages = messages.filter((message) => message.role === 'appUser');

        const channelsAvailable = hasLinkableChannels(integrations, clients, settings.web);
        const hasSomeChannelLinked = getLinkableChannels(integrations, settings.web).some((channelType) => {
            return isChannelLinked(clients, channelType);
        });

        if (channelsAvailable && !hasSomeChannelLinked) {
            if (appUserMessages.length === 1) {
                dispatch(showConnectNotification());
            } else {
                // find the last confirmed message timestamp
                let lastMessageTimestamp;

                // start at -2 to ignore the message that was just sent
                for (let index = appUserMessages.length - 2; index >= 0 && !lastMessageTimestamp; index--) {
                    const message = appUserMessages[index];
                    lastMessageTimestamp = message.received;
                }

                if (lastMessageTimestamp) {
                    // divide it by 1000 since server `received` is in seconds and not in ms
                    const currentTimeStamp = Date.now() / 1000;
                    if ((currentTimeStamp - lastMessageTimestamp) >= CONNECT_NOTIFICATION_DELAY_IN_SECONDS) {
                        dispatch(showConnectNotification());
                    }
                }
            }
        }

        return response;
    };
}

export function resetUnreadCount() {
    return (dispatch, getState) => {
        const {conversation} = getState();
        if (conversation.unreadCount > 0) {
            dispatch({
                type: RESET_UNREAD_COUNT
            });
            return core(getState()).conversations.resetUnreadCount(getUserId(getState())).then((response) => {
                return response;
            });
        }

        return Promise.resolve();
    };
}

export function handleConversationUpdated() {
    return (dispatch, getState) => {
        const {faye: {conversationSubscription}} = getState();

        if (!conversationSubscription) {
            return dispatch(getMessages())
                .then((response) => {
                    return dispatch(connectFayeConversation())
                        .then(() => {
                            return response;
                        });
                });
        }

        return Promise.resolve();
    };
}

export function resendMessage(messageClientId) {
    return (dispatch, getState) => {
        const oldMessage = getState().conversation.messages.find((message) => message._clientId === messageClientId);

        if (!oldMessage) {
            return;
        }

        const newMessage = Object.assign({}, oldMessage, {
            sendStatus: SEND_STATUS.SENDING
        });

        dispatch(replaceMessage({
            _clientId: messageClientId
        }, newMessage));

        if (newMessage.type === 'text') {
            return dispatch(sendChain(postSendMessage, newMessage));
        } else if (newMessage.type === 'location') {
            if (newMessage.coordinates) {
                return dispatch(sendChain(postSendMessage, newMessage));
            } else {
                return dispatch(sendLocation(newMessage));
            }
        }

        return dispatch(sendChain(postUploadImage, newMessage));
    };
}

export function sendLocation(props = {}) {
    return (dispatch, getState) => {
        let message;

        if (props._clientSent) {
            message = props;
        } else {
            message = dispatch(addMessage({
                type: 'location',
                ...props
            }));
        }

        if (message.coordinates) {
            return dispatch(sendChain(postSendMessage, message));
        }

        const locationServicesDeniedText = getState().ui.text.locationServicesDenied;
        const locationSecurityRestrictionText = getState().ui.text.locationSecurityRestriction;

        return new Promise((resolve) => {
            let timedOut = false;

            const timeout = setTimeout(() => {
                timedOut = true;
                dispatch(onMessageSendFailure(message));
                resolve();
            }, 10000);

            navigator.geolocation.getCurrentPosition((position) => {
                clearTimeout(timeout);
                if (timedOut) {
                    return;
                }

                Object.assign(message, {
                    coordinates: {
                        lat: position.coords.latitude,
                        long: position.coords.longitude
                    }
                });

                dispatch(replaceMessage({
                    _clientId: message._clientId
                }, message));

                dispatch(sendChain(postSendMessage, message))
                    .then(resolve);
            }, (err) => {
                clearTimeout(timeout);
                if (timedOut) {
                    return;
                }
                if (getWindowLocation().protocol !== 'https:') {
                    setTimeout(() => alert(locationSecurityRestrictionText), 100);
                    dispatch(removeMessage(message._clientId));
                } else if (err.code === LOCATION_ERRORS.PERMISSION_DENIED) {
                    setTimeout(() => alert(locationServicesDeniedText), 100);
                    dispatch(removeMessage(message._clientId));
                } else {
                    dispatch(onMessageSendFailure(message));
                }
                resolve();
            });
        });
    };
}

export function uploadImage(file) {
    return (dispatch, getState) => {
        if (!isFileTypeSupported(file.type)) {
            return Promise.resolve(dispatch(showErrorNotification(getState().ui.text.invalidFileError)));
        }

        return resizeImage(file)
            .then((dataUrl) => {
                const message = dispatch(addMessage({
                    mediaUrl: dataUrl,
                    mediaType: 'image/jpeg',
                    type: 'image'
                }));
                return dispatch(sendChain(postUploadImage, message));
            })
            .catch(() => {
                dispatch(showErrorNotification(getState().ui.text.invalidFileError));
            });
    };
}


export function getMessages() {
    return (dispatch, getState) => {
        const userId = getUserId(getState());
        return throttlePerUser(userId).exec(() => _getMessages(dispatch, getState));
    };
}

export function connectFayeConversation() {
    return (dispatch, getState) => {
        const {faye: {conversationSubscription}} = getState();

        if (!conversationSubscription) {
            return Promise.all([
                dispatch(subscribeConversation()),
                dispatch(subscribeConversationActivity())
            ]);
        }

        return Promise.resolve();
    };
}

export function connectFayeUser() {
    return (dispatch, getState) => {

        const {faye: {userSubscription}} = getState();

        if (!userSubscription) {
            return dispatch(subscribeUser());
        }

        return Promise.resolve();
    };
}

export function disconnectFaye() {
    return (dispatch, getState) => {
        const {faye: {conversationSubscription, userSubscription}} = getState();

        if (conversationSubscription) {
            conversationSubscription.cancel();
        }

        if (userSubscription) {
            userSubscription.cancel();
        }

        disconnectClient();
        dispatch(unsetFayeSubscriptions());
    };
}
