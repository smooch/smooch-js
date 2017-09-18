import sinon from 'sinon';

import { createMockedStore } from '../utils/redux';

import * as userActions from '../../src/frame/js/actions/user';
import * as authActions from '../../src/frame/js/actions/auth';
import * as appStateActions from '../../src/frame/js/actions/app-state';
import * as Smooch from '../../src/frame/js/smooch';
import { __Rewire__ as SmoochRewire } from '../../src/frame/js/smooch';

const AppStore = require('../../src/frame/js/store');
const store = AppStore.store;

function mockAppStore(sinon, state) {
    var mockedStore = createMockedStore(sinon, state);

    Object.defineProperty(AppStore, 'store', {
        get: () => {
            return mockedStore;
        }
    });

    return mockedStore;
}

function restoreAppStore() {
    Object.defineProperty(AppStore, 'store', {
        get: () => {
            return store;
        }
    });
}

const defaultState = {
    user: {
        conversationStarted: true
    },
    conversation: {
        messages: []
    },
    appState: {
        serverUrl: 'http://localhost'
    },
    auth: {
        jwt: '1234'
    },
    faye: {
        subscription: true
    },
    ui: {
        text: {}
    },
    app: {
        settings: {
            web: {}
        }
    }
};

describe('Smooch', () => {
    const sandbox = sinon.sandbox.create();

    let loginStub;
    let coreStub;
    let immediateUpdateStub;
    let handleConversationUpdatedStub;
    let sendMessageStub;
    let disconnectFayeStub;
    let updateUserStub;
    let getUserIdStub;
    let openWidgetStub;
    let closeWidgetStub;
    let mockedStore;

    beforeEach(() => {
        SmoochRewire('renderWidget', sandbox.stub().returns({}));

        handleConversationUpdatedStub = sandbox.stub().returnsAsyncThunk();
        SmoochRewire('handleConversationUpdated', handleConversationUpdatedStub);

        disconnectFayeStub = sandbox.stub().returnsAsyncThunk();
        SmoochRewire('disconnectFaye', disconnectFayeStub);

        immediateUpdateStub = sandbox.stub().returnsAsyncThunk();
        updateUserStub = sandbox.stub();
        getUserIdStub = sandbox.stub().returns('1234');

        SmoochRewire('userActions', {
            ...userActions,
            update: updateUserStub,
            immediateUpdate: immediateUpdateStub,
            getUserId: getUserIdStub
        });

        loginStub = sandbox.stub().returnsAsyncThunk({
            value: {
                appUser: {
                    _id: 1
                },
                app: {
                    settings: {
                        web: {
                            channels: {}
                        }
                    },
                    integrations: []
                }
            }
        });

        SmoochRewire('authActions', {
            ...authActions,
            login: loginStub
        });

        SmoochRewire('hasChannels', sandbox.stub().returns(false));
        SmoochRewire('getIntegration', sandbox.stub().returns({}));


        openWidgetStub = sandbox.stub().returnsSyncThunk();
        closeWidgetStub = sandbox.stub().returnsSyncThunk();
        SmoochRewire('appStateActions', {
            ...appStateActions,
            openWidget: openWidgetStub,
            closeWidget: closeWidgetStub
        });

        coreStub = sandbox.spy();
        SmoochRewire('core', coreStub);

        sandbox.stub(document.body, 'appendChild');
        sandbox.stub(document.body, 'removeChild');
        sandbox.stub(document, 'addEventListener', (eventName, cb) => {
            if (eventName === 'DOMContentLoaded') {
                cb();
            }
        });

        mockedStore = mockAppStore(sandbox, defaultState);
    });

    afterEach(() => {
        sandbox.restore();
        restoreAppStore();
    });

    describe('Init', () => {
        let smoochLoginStub;

        beforeEach(() => {
            smoochLoginStub = sandbox.stub().resolves();
            SmoochRewire('login', smoochLoginStub);
        });

        it('should call login', () => {
            const props = {
                userId: 'some-id',
                appToken: 'some-token',
                jwt: 'some-jwt',
                email: 'some@email.com'
            };

            return Smooch.init(props).then(() => {
                smoochLoginStub.should.have.been.calledWith(props.userId, props.jwt, {
                    email: 'some@email.com'
                });
            });
        });

    });

    describe('Login', () => {
        afterEach(() => {
            sandbox.restore();
        });

        it.skip('should reset the user', () => {
            const props = {
                userId: 'some-id',
                appToken: 'some-token',
                jwt: 'some-jwt',
                email: 'some@email.com'
            };

            return Smooch.login(props.userId, props.jwt).then(() => {
                mockedStore.dispatch.firstCall.should.have.been.calledWith({
                    type: 'RESET_AUTH'
                });

                mockedStore.dispatch.secondCall.should.have.been.calledWith({
                    type: 'RESET_USER'
                });


                mockedStore.dispatch.thirdCall.should.have.been.calledWith({
                    type: 'RESET_CONVERSATION'
                });

                disconnectFayeStub.should.have.been.calledOnce;
            });
        });

        describe('conversation started', () => {
            const state = Object.assign({}, defaultState);
            beforeEach(() => {
                mockedStore = mockAppStore(sandbox, state);
            });

            it('should call the login action, update the user, and handle the conversation update', () => {
                const props = {
                    userId: 'some-id',
                    appToken: 'some-token',
                    jwt: 'some-jwt',
                    email: 'some@email.com'
                };

                return Smooch.login(props.userId, props.jwt).then(() => {
                    const callArgs = loginStub.args[0][0];
                    callArgs.userId.should.eq(props.userId);
                    immediateUpdateStub.should.have.been.calledWith, {
                        email: 'some@email.com'
                    };
                    handleConversationUpdatedStub.should.have.been.calledOnce;
                });
            });
        });
    });

    describe('Send message', () => {
        beforeEach(() => {
            mockedStore = mockAppStore(sandbox, defaultState);

            sendMessageStub = sandbox.stub().returnsAsyncThunk({
                value: {}
            });
            SmoochRewire('_sendMessage', sendMessageStub);
        });

        it('should call the conversation action', () => {
            return Smooch.sendMessage('here is my message').then(() => {
                sendMessageStub.should.have.been.calledWith('here is my message');
            });
        });

    });

    describe('Get conversation', () => {
        beforeEach(() => {
            mockedStore = mockAppStore(sandbox, defaultState);
        });

        describe('conversation exists', () => {

            it('should call handleConversationUpdated', () => {
                return Smooch.getConversation().then(() => {
                    handleConversationUpdatedStub.should.have.been.calledOnce;
                });
            });

            it('should resolve conversation object', () => {
                return Smooch.getConversation().then((conversation) => {
                    if (!conversation.messages) {
                        return Promise.reject(new Error('Conversation not found'));
                    }
                });
            });

            it('should update conversationStarted to true ', () => {
                return Smooch.getConversation().then(() => {
                    mockedStore.dispatch.should.have.been.calledWith({
                        type: 'UPDATE_USER',
                        properties: {
                            conversationStarted: true
                        }
                    });
                });
            });
        });

        describe('conversation does not exist', () => {
            beforeEach(() => {
                handleConversationUpdatedStub.returns(() => Promise.reject());
            });

            it('should reject', (done) => {
                return Smooch.getConversation()
                    .then(() => done(new Error('Promise should not have resolved')))
                    .catch(() => done());
            });

            it('should not update conversationStarted to true ', () => {
                return Smooch.getConversation().catch(() => {
                    mockedStore.dispatch.should.not.have.been.calledWith({
                        type: 'UPDATE_USER',
                        properties: {
                            conversationStarted: true
                        }
                    });
                });
            });
        });

    });

    describe('Update user', () => {
        describe('conversation started', () => {
            beforeEach(() => {
                updateUserStub.returnsAsyncThunk({
                    value: {
                        appUser: {
                            conversationStarted: true
                        }
                    }
                });
            });

            it('should call handleConversationUpdated', () => {
                return Smooch.updateUser({
                    email: 'update@me.com'
                }).then(() => {
                    updateUserStub.should.have.been.calledWith({
                        email: 'update@me.com'
                    });

                    handleConversationUpdatedStub.should.have.been.calledOnce;
                });
            });
        });

        describe('conversation not started', () => {
            beforeEach(() => {
                updateUserStub.returnsAsyncThunk({
                    value: {
                        appUser: {
                            conversationStarted: false
                        }
                    }
                });
            });

            it('should not handleConversationUpdated', () => {
                return Smooch.updateUser({
                    email: 'update@me.com'
                }).then(() => {
                    updateUserStub.should.have.been.calledWith({
                        email: 'update@me.com'
                    });

                    handleConversationUpdatedStub.should.not.have.been.calledOnce;
                });
            });
        });
    });

    describe('Logout', () => {
        let smoochLoginStub;

        beforeEach(() => {
            smoochLoginStub = sandbox.stub().resolves();
            SmoochRewire('login', smoochLoginStub);
        });

        it('should call login', () => {
            Smooch.logout().then(() => {
                smoochLoginStub.should.have.been.called;
            });
        });
    });

    describe('Open', () => {
        it('should dispatch open action', () => {
            Smooch.open();
            openWidgetStub.should.have.been.calledOnce;
        });
    });

    describe('Close', () => {
        it('should dispatch close action', () => {
            Smooch.close();
            closeWidgetStub.should.have.been.calledOnce;
        });
    });

    describe('Get User Id', () => {
        it('should call the conversation action', () => {
            return Smooch.getUserId(mockedStore.getState()).should.eq('1234');
        });
    });

    describe('Get Core', () => {
        it('should call the core utils', () => {
            Smooch.getCore();
            coreStub.should.have.been.calledOnce;
        });
    });
});
