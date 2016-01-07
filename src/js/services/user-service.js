import deepEqual from 'deep-equal';
import { store } from 'stores/app-store';
import { core } from 'services/core';
import { setUser } from 'actions/user-actions';
import { getConversation, connectFaye } from 'services/conversation-service';

let waitForSave = false;
const waitDelay = 5000; // ms
let pendingUserProps = {};
let previousValue = Promise.resolve();

export const EDITABLE_PROPERTIES = [
    'givenName',
    'surname',
    'email',
    'signedUpAt',
    'properties'
];

export function immediateUpdate(props) {
    const user = store.getState().user;

    props = Object.assign({}, pendingUserProps, props);
    pendingUserProps = {};

    let isDirty = EDITABLE_PROPERTIES.reduce((isDirty, prop) => {
        return isDirty || !deepEqual(user[prop], props[prop]);
    }, false);

    return isDirty ? core().appUsers.update(user._id, props).then((response) => {
        store.dispatch(setUser(response.appUser));
        return response;
    }).catch((e) => {
        console.error(e); //eslint-disable-line no-console
        throw e;
    }) : Promise.resolve({
        user: user
    });
}

export function update(props) {
    Object.assign(pendingUserProps, props);

    if (waitForSave) {
        return previousValue;
    } else {
        previousValue = immediateUpdate(pendingUserProps);
        waitForSave = true;
        pendingUserProps = {};

        setTimeout(() => {
            waitForSave = false;
        }, waitDelay);
    }

    return previousValue;
}

export function trackEvent(eventName, userProps) {
    const user = store.getState().user;
    return core().appUsers.trackEvent(user._id, eventName, userProps).then((response) => {
        if (response.conversationUpdated) {
            return getConversation()
                .then(connectFaye)
                .then(() => {
                    return response;
                });
        }

        return response;
    }).catch((e) => {
        console.log(e); //eslint-disable-line no-console
        throw e;
    });
}
