import React from 'react';
import { render as reactRender } from 'react-dom';
import { batchActions } from 'redux-batched-actions';
import { Provider } from 'react-redux';
import '../stylesheets/main.less';
import Raven from 'raven-js';

import { store } from './store';

import * as authActions from './actions/auth';
import * as userActions from './actions/user';
import { updateText } from './actions/ui';
import { setCurrentLocation } from './actions/browser';
import { sendMessage as _sendMessage, disconnectFaye, fetchUserConversation } from './actions/conversation';
import * as appStateActions from './actions/app-state';
import { setConfig, fetchConfig } from './actions/config';
import { reset } from './actions/common';

import { observable, observeStore } from './utils/events';
import { waitForPage, monitorUrlChanges, stopMonitoringUrlChanges, monitorBrowserState, stopMonitoringBrowserState, updateHostClassNames } from './utils/dom';
import { isImageUploadSupported } from './utils/media';
import { playNotificationSound, isAudioSupported } from './utils/sound';
import * as storage from './utils/storage';

import { WIDGET_STATE } from './constants/app';

import Widget from './components/Widget';

let lastTriggeredMessageTimestamp = 0;
let initialStoreChange = true;
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

function onStoreChange(props, previousProps) {
    const {conversation: {messages, unreadCount}, widgetState, displayStyle} = props;
    const {conversation: {unreadCount:previousUnreadCount}, widgetState: previousWidgetState, displayStyle: previousDisplayStyle} = previousProps;

    if (messages.length > 0) {
        if (unreadCount > 0 && unreadCount !== previousUnreadCount) {
            // only handle non-user messages
            const filteredMessages = messages.filter((message) => message.role !== 'appUser');
            filteredMessages.slice(-unreadCount).filter((message) => message.received > lastTriggeredMessageTimestamp).forEach((message) => {
                observable.trigger('message:received', message);
                lastTriggeredMessageTimestamp = message.received;

                if (!initialStoreChange) {
                    handleNotificationSound();
                }
            });
        }
        observable.trigger('unreadCount', unreadCount);
    }

    if (widgetState !== previousWidgetState || displayStyle !== previousDisplayStyle) {
        updateHostClassNames(widgetState, displayStyle);
    }

    initialStoreChange = false;

}

function cleanUp() {
    store.dispatch(disconnectFaye());
    stopMonitoringBrowserState();
    stopMonitoringUrlChanges();
    unsubscribeFromStore();
    store.dispatch(reset());
}

export function on(...args) {
    return observable.on(...args);
}

export function off(...args) {
    return observable.off(...args);
}

export function init(props = {}) {
    const {appState: {isInitialized}} = store.getState();

    if (isInitialized) {
        throw new Error('Web Messenger is already initialized. Call `destroy()` first before calling `init()` again.');
    }

    if (!props.appId) {
        throw new Error('Must provide an appId');
    }

    lastTriggeredMessageTimestamp = 0;
    initialStoreChange = true;

    props = {
        imageUploadEnabled: true,
        soundNotificationEnabled: true,
        ...props
    };

    Raven.setExtraContext({
        appId: props.appId
    });

    const sessionToken = storage.getItem(`${props.appId}.sessionToken`);
    const appUserId = storage.getItem(`${props.appId}.appUserId`);

    const actions = [
        appStateActions.setInitializationState(true),
        appStateActions.setEmbedded(!!props.embedded),
        setCurrentLocation(parent.document.location),
        setConfig('appId', props.appId),
        setConfig('soundNotificationEnabled', props.soundNotificationEnabled && isAudioSupported()),
        setConfig('imageUploadEnabled', props.imageUploadEnabled && isImageUploadSupported()),
        setConfig('configBaseUrl', props.configBaseUrl || `https://${props.appId}.config.smooch.io`)
    ];

    if (appUserId) {
        actions.push(userActions.setUser({
            _id: appUserId
        }));
    }

    if (sessionToken) {
        actions.push(authActions.setAuth({
            sessionToken
        }));
    }

    if (props.customText) {
        actions.push(updateText(props.customText));
    }

    store.dispatch(batchActions(actions));

    unsubscribeFromStore = observeStore(store, ({config: {appId}, conversation, appState: {widgetState}, config: {style}, browser: {currentLocation}}) => {
        return {
            conversation,
            widgetState,
            displayStyle: style && style.displayStyle,
            currentLocation,
            appId
        };
    }, onStoreChange);

    monitorBrowserState(store.dispatch.bind(store));

    monitorUrlChanges(() => store.dispatch(setCurrentLocation(parent.document.location)));

    return store.dispatch(fetchConfig())
        .then(() => {
            if (props.userId && props.jwt) {
                return login(props.userId, props.jwt);
            }

            if (appUserId && sessionToken) {
                return store.dispatch(fetchUserConversation());
            }
        })
        .then(() => {
            if (!props.embedded) {
                render();
            }

            observable.trigger('ready');
        })
        .catch(() => {
            cleanUp();
        });
}

export function login(userId, jwt) {
    if (!userId || !jwt) {
        throw new Error('Must provide a userId and a jwt to log in.');
    }

    const actions = [
        authActions.setAuth({
            jwt
        }),
        userActions.setUser({
            userId
        })
    ];

    store.dispatch(batchActions(actions));

    return store.dispatch(authActions.login());
}

export function logout() {
    return login();
}

export function sendMessage(props) {
    return store.dispatch(_sendMessage(props));
}

export function updateUser(props) {
    return store.dispatch(userActions.update(props));
}

export function getConversation() {
    return store.getState().conversation;
}

export function getUserId() {
    return userActions.getUserId(store.getState());
}

export function destroy() {
    // `destroy()` only need to clean up handlers
    // the rest will be cleaned up with the iframe removal
    const {appState: {isInitialized}} = store.getState();
    if (!isInitialized) {
        return;
    }

    cleanUp();
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
