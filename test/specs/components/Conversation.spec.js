import sinon from 'sinon';
import TestUtils from 'react-dom/test-utils';

import Conversation from '../../../src/frame/js/components/Conversation';
import Message from '../../../src/frame/js/components/Message';
import Introduction from '../../../src/frame/js/components/Introduction';
import ConnectNotification from '../../../src/frame/js/components/ConnectNotification';
import ReplyActions from '../../../src/frame/js/components/ReplyActions';
import TypingIndicator from '../../../src/frame/js/components/TypingIndicator';

import { mockComponent, wrapComponentWithStore } from '../../utils/react';
import { createMockedStore, generateBaseStoreProps } from '../../utils/redux';

const sandbox = sinon.sandbox.create();

function getStoreState(state = {}) {
    return generateBaseStoreProps({
        ui: {
            text: {
                fetchingHistory: 'fetching-history',
                fetchHistory: 'fetch-history'
            }
        },
        appState: {
            shouldScrollToBottom: true,
            isFetchingMoreMessages: false,
            introHeight: 100,
            typingIndicatorShown: false,
            ...state.appState
        },
        conversation: {
            messages: [
                {
                    _id: 1,
                    received: 1,
                    role: 'appMaker'
                },
                {
                    _id: 2,
                    received: 2,
                    role: 'appMaker'
                },
                {
                    _id: 3,
                    received: 3,
                    role: 'appMaker'
                },
                {
                    _id: 4,
                    received: 4,
                    role: 'appMaker'
                }
            ],
            replyActions: [],
            hasMoreMessages: false,
            ...state.conversation
        }
    });
}

describe('Conversation Component', () => {

    let component;
    let mockedStore;

    beforeEach(() => {
        // mock it, we don't care about the rendering of those, they are covered in separate tests
        mockComponent(sandbox, Message, 'div', {
            className: 'mockedMessage'
        });
        mockComponent(sandbox, Introduction, 'div', {
            className: 'mockedIntroduction'
        });
        mockComponent(sandbox, ConnectNotification, 'div', {
            className: 'mockedConnectNotification'
        });
        mockComponent(sandbox, ReplyActions, 'div', {
            className: 'mockedReplyActions'
        });
        mockComponent(sandbox, TypingIndicator, 'div', {
            className: 'mockedTypingIndicator'
        });

        mockedStore = createMockedStore(sandbox, getStoreState());
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('render', () => {
        beforeEach(() => {
            component = wrapComponentWithStore(Conversation, null, mockedStore);
        });

        it('should generate all messages in the props', () => {
            TestUtils.scryRenderedDOMComponentsWithClass(component, 'mockedMessage').length.should.eq(mockedStore.getState().conversation.messages.length);
        });

        it('should render introduction text', () => {
            TestUtils.scryRenderedDOMComponentsWithClass(component, 'mockedIntroduction').length.should.eq(1);
        });

        it('should not render reply actions', () => {
            TestUtils.scryRenderedDOMComponentsWithClass(component, 'mockedReplyActions').length.should.eq(0);
        });
    });

    describe('ConnectNotification component', () => {
        beforeEach(() => {
            mockedStore = createMockedStore(sandbox, getStoreState({
                appState: {
                    connectNotificationTimestamp: 5
                }
            }));

            component = wrapComponentWithStore(Conversation, null, mockedStore);
        });

        it('should render', () => {
            TestUtils.scryRenderedDOMComponentsWithClass(component, 'mockedConnectNotification').length.should.eq(1);
        });
    });

    describe('Introduction component', () => {
        [true, false].forEach((hasMoreMessages) => {
            describe(`${hasMoreMessages ? '' : 'no'} more messages to fetch`, () => {
                it(`should ${hasMoreMessages ? 'not' : ''} render`, () => {
                    mockedStore = createMockedStore(sandbox, getStoreState({
                        conversation: {
                            hasMoreMessages
                        }
                    }));

                    component = wrapComponentWithStore(Conversation, null, mockedStore);
                    TestUtils.scryRenderedDOMComponentsWithClass(component, 'mockedIntroduction').length.should.eq(hasMoreMessages ? 0 : 1);
                });
            });
        });
    });

    describe('Reply Actions', () => {
        beforeEach(() => {
            mockedStore = createMockedStore(sandbox, getStoreState({
                conversation: {
                    messages: [
                        {
                            _id: 1,
                            received: 1,
                            role: 'appMaker'
                        },
                        {
                            _id: 2,
                            received: 2,
                            role: 'appMaker'
                        },
                        {
                            _id: 3,
                            received: 3,
                            role: 'appMaker'
                        },
                        {
                            _id: 4,
                            received: 4,
                            role: 'appMaker'
                        },
                        {
                            _id: 5,
                            received: 5,
                            role: 'appMaker',
                            actions: [
                                {
                                    type: 'reply',
                                    text: 'reply'
                                }
                            ]
                        }
                    ],
                    replyActions: [
                        {
                            type: 'reply',
                            text: 'reply'
                        }
                    ]
                }
            }));
            component = wrapComponentWithStore(Conversation, null, mockedStore);
        });

        it('should render reply actions', () => {
            TestUtils.scryRenderedDOMComponentsWithClass(component, 'mockedReplyActions').length.should.eq(1);

        });
    });
    describe('TypingIndicator component', () => {
        [true, false].forEach((typingIndicatorShown) => {
            describe(`typingIndicatorShown is ${typingIndicatorShown ? 'on' : 'off'}`, () => {
                it(`should ${typingIndicatorShown ? '' : 'not'} render`, () => {
                    mockedStore = createMockedStore(sandbox, getStoreState({
                        appState: {
                            typingIndicatorShown
                        }
                    }));

                    component = wrapComponentWithStore(Conversation, null, mockedStore);
                    TestUtils.scryRenderedDOMComponentsWithClass(component, 'mockedTypingIndicator').length.should.eq(typingIndicatorShown ? 1 : 0);
                });
            });
        });
    });
});
