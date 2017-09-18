import React from 'react';
import { render as reactRender } from 'react-dom';
import pick from 'lodash.pick';
import { batchActions } from 'redux-batched-actions';
import { Provider } from 'react-redux';
import Raven from 'raven-js';

import '../stylesheets/main.less';

import { store } from './store';

import * as authActions from './actions/auth';
import * as userActions from './actions/user';
import { setStripeInfo, setApp } from './actions/app';
import { updateText } from './actions/ui';
import { setCurrentLocation } from './actions/browser';
import { sendMessage as _sendMessage, disconnectFaye, handleConversationUpdated, resetConversation } from './actions/conversation';
import { resetIntegrations } from './actions/integrations';
import * as appStateActions from './actions/app-state';
import { getAccount } from './actions/stripe';

import { core } from './utils/core';
import { observable, observeStore } from './utils/events';
import { waitForPage, monitorUrlChanges, stopMonitoringUrlChanges, monitorBrowserState, stopMonitoringBrowserState, updateHostClassNames } from './utils/dom';
import { isImageUploadSupported } from './utils/media';
import { playNotificationSound, isAudioSupported } from './utils/sound';
import { getDeviceId } from './utils/device';
import { getIntegration } from './utils/app';

import { WIDGET_STATE } from './constants/app';

import Widget from './components/Widget';

let appToken;
let lastTriggeredMessageTimestamp = 0;
let initialStoreChange = true;
let isInitialized = false;
let unsubscribeFromStore;

// Listen for media query changes from the host page.
window.addEventListener('message', ({data, origin}) => {
    if (origin === `${parent.document.location.protocol}//${parent.document.location.host}`) {
        if (data.type === 'sizeChange') {
            store.dispatch(appStateActions.updateWidgetSize(data.value));
        }
    }
}, false);

function renderWidget() {
    waitForPage().then(() => {
        const mount = document.querySelector('#mount');
        reactRender(<Provider store={ store }>
                        <Widget />
                    </Provider>, mount);
    });
}

observable.on('message:sent', (message) => {
    observable.trigger('message', message);
});
observable.on('message:received', (message) => {
    observable.trigger('message', message);
});

function handleNotificationSound() {
    const {appState: {soundNotificationEnabled}, browser: {hasFocus}} = store.getState();

    if (soundNotificationEnabled && !hasFocus) {
        playNotificationSound();
    }
}

function onStoreChange({conversation: {messages, unreadCount}, widgetState, displayStyle}) {
    if (messages.length > 0) {
        if (unreadCount > 0) {
            // only handle non-user messages
            const filteredMessages = messages.filter((message) => message.role !== 'appUser');
            filteredMessages.slice(-unreadCount).filter((message) => message.received > lastTriggeredMessageTimestamp).forEach((message) => {
                observable.trigger('message:received', message);
                lastTriggeredMessageTimestamp = message.received;

                if (initialStoreChange) {
                    initialStoreChange = false;
                } else {
                    handleNotificationSound();
                }
            });
        }
        observable.trigger('unreadCount', unreadCount);
    }

    updateHostClassNames(widgetState, displayStyle);
}

export function on(...args) {
    return observable.on(...args);
}

export function off(...args) {
    return observable.off(...args);
}

export function init(props) {
    isInitialized = true;

    props = {
        imageUploadEnabled: true,
        soundNotificationEnabled: true,
        ...props
    };

    appToken = props.appToken;

    const actions = [];

    if (props.soundNotificationEnabled && isAudioSupported()) {
        actions.push(appStateActions.enableSoundNotification());
    } else {
        actions.push(appStateActions.disableSoundNotification());
    }

    if (props.imageUploadEnabled && isImageUploadSupported()) {
        actions.push(appStateActions.enableImageUpload());
    } else {
        actions.push(appStateActions.disableImageUpload());
    }

    actions.push(appStateActions.setEmbedded(!!props.embedded));

    if (props.customText) {
        actions.push(updateText(props.customText));
    }

    if (props.serviceUrl) {
        actions.push(appStateActions.setServerURL(props.serviceUrl));
    }

    store.dispatch(batchActions(actions));

    unsubscribeFromStore = observeStore(store, ({conversation, appState: {widgetState}, app: {settings: {web: {displayStyle}}}}) => {
        return {
            conversation,
            widgetState,
            displayStyle
        };
    }, onStoreChange);

    monitorBrowserState(store.dispatch.bind(store));
    return login(props.userId, props.jwt, pick(props, userActions.EDITABLE_PROPERTIES));
}

export function login(userId = '', jwt, attributes) {
    if (arguments.length === 2 && typeof jwt === 'object') {
        attributes = jwt;
        jwt = undefined;
    } else if (arguments.length < 3) {
        attributes = {};
    }

    const actions = [];
    // in case those are opened;
    actions.push(appStateActions.hideSettings());
    actions.push(appStateActions.hideChannelPage());

    // in case it comes from a previous authenticated state
    actions.push(authActions.resetAuth());
    actions.push(userActions.resetUser());
    actions.push(resetConversation());
    actions.push(resetIntegrations());


    attributes = pick(attributes, userActions.EDITABLE_PROPERTIES);

    if (store.getState().appState.emailCaptureEnabled && attributes.email) {
        actions.push(appStateActions.setEmailReadonly());
    } else {
        actions.push(appStateActions.unsetEmailReadonly());
    }

    actions.push(authActions.setAuth({
        jwt: jwt,
        appToken
    }));

    store.dispatch(batchActions(actions));
    store.dispatch(disconnectFaye());

    lastTriggeredMessageTimestamp = 0;
    initialStoreChange = true;


    return store.dispatch(authActions.login({
        userId: userId,
        device: {
            platform: 'web',
            id: getDeviceId(),
            info: {
                sdkVersion: VERSION,
                URL: parent.document.location.host,
                userAgent: navigator.userAgent,
                referrer: parent.document.referrer,
                browserLanguage: navigator.language,
                currentUrl: parent.document.location.href,
                currentTitle: parent.document.title
            }
        }
    })).then((loginResponse) => {
        Raven.setUserContext({
            id: loginResponse.appUser.userId || loginResponse.appUser._id
        });

        Raven.setExtraContext({
            appToken
        });

        const actions = [];
        actions.push(userActions.setUser(loginResponse.appUser));
        actions.push(setApp(loginResponse.app));

        actions.push(setCurrentLocation(parent.document.location));
        monitorUrlChanges(() => {
            const actions = [
                setCurrentLocation(parent.document.location),
                userActions.updateNowViewing(getDeviceId())
            ];

            store.dispatch(batchActions(actions));
        });

        store.dispatch(batchActions(actions));

        if (getIntegration(loginResponse.app.integrations, 'stripeConnect')) {
            return store.dispatch(getAccount()).then((r) => {
                store.dispatch(setStripeInfo(r.account));
            }).catch(() => {
                // do nothing about it and let the flow continue
            });
        }
    }).then(() => {
        return store.dispatch(userActions.immediateUpdate(attributes)).then(() => {
            const user = store.getState().user;
            if (user.conversationStarted) {
                return store.dispatch(handleConversationUpdated());
            }
        });
    }).then(() => {
        if (!store.getState().appState.embedded) {
            render();
        }

        const user = store.getState().user;

        observable.trigger('ready', user);

        return user;
    });
}

export function logout() {
    return login();
}

export function sendMessage(props) {
    return store.dispatch(_sendMessage(props));
}

export function updateUser(props) {
    return store.dispatch(userActions.update(props)).then((response) => {
        if (response.appUser.conversationStarted) {
            return store.dispatch(handleConversationUpdated())
                .then(() => {
                    return response;
                });
        }

        return response;
    });
}

export function getConversation() {
    return store.dispatch(handleConversationUpdated())
        .then(() => {
            store.dispatch(userActions.updateUser({
                conversationStarted: true
            }));
            return store.getState().conversation;
        });
}

export function getUserId() {
    return userActions.getUserId(store.getState());
}

export function getCore() {
    return core(store.getState());
}

export function destroy() {
    // `destroy()` only need to clean up handlers
    // the rest will be cleaned up with the iframe removal

    if (!isInitialized) {
        return;
    }

    stopMonitoringBrowserState();
    stopMonitoringUrlChanges();
    unsubscribeFromStore();

    store.dispatch(disconnectFaye());
    observable.trigger('destroy');
    observable.off();
}

export function open() {
    store.dispatch(appStateActions.openWidget());
}

export function close() {
    store.dispatch(appStateActions.closeWidget());
}

export function isOpened() {
    return store.getState().appState.widgetState === WIDGET_STATE.OPENED;
}

export function render() {
    return renderWidget();
}
