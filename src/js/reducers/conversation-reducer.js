import * as ConversationActions from 'actions/conversation-actions';
import { RESET } from 'actions/common-actions';

const INITIAL_STATE = {
    messages: [],
    unreadCount: 0
};

const sortMessages = (messages) => messages.sort((messageA, messageB) => {
    // received is undefined when it's the temp message from the user
    if (!messageA.received && !messageB.received) {
        // `_tempSent` is a local only prop
        return messageA._tempSent - messageB._tempSent;
    }

    if (!messageA.received) {
        return 1;
    }

    if (!messageB.received) {
        return -1;
    }

    return messageA.received - messageB.received;
});

const addMessage = (messages, message) => {
    return sortMessages([...messages, message]);
};

const matchMessage = (message, queryProps) => Object.keys(queryProps).every((key) => message[key] === queryProps[key]);

const replaceMessage = (messages, query, newMessage) => {
    const existingMessage = messages.find((message) => matchMessage(message, query));
    if (!existingMessage) {
        return messages;
    }

    const index = messages.indexOf(existingMessage);
    return [...messages.slice(0, index), newMessage, ...messages.slice(index + 1)];
};

const removeDuplicates = (messages) => {
    const messagesNoDuplicates = [];
    const messagesHash = {};

    messages.forEach((message) => {
        const key = message._id + message.role + message.mediaType;
        if (!(key in messagesHash)) {
            messagesHash[key] = message;
            messagesNoDuplicates.push(message);
        }
    });

    return messagesNoDuplicates;
};

export function ConversationReducer(state = INITIAL_STATE, action) {
    switch (action.type) {
        case RESET:
        case ConversationActions.RESET_CONVERSATION:
            return Object.assign({}, INITIAL_STATE);
        case ConversationActions.SET_CONVERSATION:
            return Object.assign({}, action.conversation, {
                messages: sortMessages(removeDuplicates(action.conversation.messages))
            });
        case ConversationActions.ADD_MESSAGE:
            return Object.assign({}, state, {
                messages: addMessage(state.messages, action.message)
            });
        case ConversationActions.REPLACE_MESSAGE:
            return Object.assign({}, state, {
                messages: replaceMessage(state.messages, action.queryProps, action.message)
            });
        case ConversationActions.REMOVE_MESSAGE:
            return Object.assign({}, state, {
                messages: [...state.messages.filter((message) => !matchMessage(message, action.queryProps))]
            });
        case ConversationActions.INCREMENT_UNREAD_COUNT:
            return Object.assign({}, state, {
                unreadCount: state.unreadCount + 1
            });
        case ConversationActions.RESET_UNREAD_COUNT:
            return Object.assign({}, state, {
                unreadCount: 0
            });
        default:
            return state;
    }
}
