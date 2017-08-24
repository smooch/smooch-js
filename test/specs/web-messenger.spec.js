import sinon from 'sinon';
import hat from 'hat';

import { createMockedStore, generateBaseStoreProps } from '../utils/redux';

import * as userActions from '../../src/frame/js/actions/user';
import * as authActions from '../../src/frame/js/actions/auth';
import * as storage from '../../src/frame/js/utils/storage';
import * as appStateActions from '../../src/frame/js/actions/app-state';
import * as WebMessenger from '../../src/frame/js/web-messenger';
import { __Rewire__ as WebMessengerRewire } from '../../src/frame/js/web-messenger';

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

const defaultState = generateBaseStoreProps({
    config: {
        app: {
            status: 'active'
        }
    }
});

describe('WebMessenger', () => {
    const sandbox = sinon.sandbox.create();

    let loginStub;
    let logoutStub;
    let setUserStub;
    let setAuthStub;
    let immediateUpdateStub;
    let sendMessageStub;
    let disconnectFayeStub;
    let updateUserStub;
    let openWidgetStub;
    let closeWidgetStub;
    let fetchUserConversationStub;
    let cleanUpStub;
    let getItemStub;
    let mockedStore;
    let resetAuthStub;
    let resetUserStub;
    let removeItemStub;

    beforeEach(() => {
        WebMessengerRewire('renderWidget', sandbox.stub().returns({}));

        disconnectFayeStub = sandbox.stub().returnsAsyncThunk();
        WebMessengerRewire('disconnectFaye', disconnectFayeStub);
        fetchUserConversationStub = sandbox.stub().returnsAsyncThunk();
        WebMessengerRewire('fetchUserConversation', fetchUserConversationStub);

        immediateUpdateStub = sandbox.stub().returnsAsyncThunk();
        updateUserStub = sandbox.stub();
        cleanUpStub = sandbox.stub();
        setUserStub = sandbox.stub();
        setAuthStub = sandbox.stub();
        resetAuthStub = sandbox.stub();
        resetUserStub = sandbox.stub();

        WebMessengerRewire('userActions', {
            ...userActions,
            update: updateUserStub,
            immediateUpdate: immediateUpdateStub,
            setUser: setUserStub,
            resetUser: resetUserStub
        });

        loginStub = sandbox.stub().returnsAsyncThunk();
        logoutStub = sandbox.stub().returnsAsyncThunk();

        WebMessengerRewire('authActions', {
            ...authActions,
            login: loginStub,
            logout: logoutStub,
            setAuth: setAuthStub,
            resetAuth: resetAuthStub
        });

        WebMessengerRewire('cleanUp', cleanUpStub);

        openWidgetStub = sandbox.stub().returnsSyncThunk();
        closeWidgetStub = sandbox.stub().returnsSyncThunk();
        WebMessengerRewire('appStateActions', {
            ...appStateActions,
            openWidget: openWidgetStub,
            closeWidget: closeWidgetStub
        });

        getItemStub = sandbox.stub();
        removeItemStub = sandbox.stub();
        WebMessengerRewire('storage', {
            ...storage,
            getItem: getItemStub,
            removeItem: removeItemStub
        });

        sandbox.stub(document.body, 'appendChild');
        sandbox.stub(document.body, 'removeChild');
        sandbox.stub(document, 'addEventListener').callsFake((eventName, cb) => {
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
        let fetchConfigStub;
        let loginStub;
        let renderStub;

        beforeEach(() => {
            fetchConfigStub = sandbox.stub().returnsAsyncThunk();
            loginStub = sandbox.stub().resolves();
            renderStub = sandbox.stub();
            WebMessengerRewire('fetchConfig', fetchConfigStub);
            WebMessengerRewire('login', loginStub);
            WebMessengerRewire('render', renderStub);
        });

        [true, false].forEach((hasAppUserId) => {
            [true, false].forEach((hasSessionToken) => {
                describe(`with${hasAppUserId ? '' : 'out'} appUserId and with${hasSessionToken? '':'out'} sessionToken`, () => {
                    beforeEach(() => {
                        getItemStub.callsFake((key) => {
                            if (hasAppUserId && key.endsWith('appUserId')) {
                                return 'some-user-id';
                            }

                            if (hasSessionToken && key.endsWith('sessionToken')) {
                                return 'some-session-token';
                            }

                            return null;
                        });
                    });

                    describe('anonymous user', () => {
                        it('should fetch config, not call login, and render', () => {
                            const props = {
                                appId: 'some-app-id'
                            };

                            return WebMessenger.init(props).then(() => {
                                fetchConfigStub.should.have.been.calledOnce;
                                loginStub.should.not.have.been.called;
                                renderStub.should.have.been.calledOnce;

                                if (hasSessionToken) {
                                    setAuthStub.should.have.been.calledOnce;
                                } else {
                                    setAuthStub.should.not.have.been.called;
                                }

                                if (hasAppUserId) {
                                    setUserStub.should.have.been.calledOnce;
                                } else {
                                    setUserStub.should.not.have.been.called;
                                }

                                if (hasSessionToken && hasAppUserId) {
                                    fetchUserConversationStub.should.have.been.calledOnce;
                                }
                            });
                        });

                        if (hasAppUserId && hasSessionToken) {
                            it('should reset local user data on invalid_auth error', () => {
                                const error = new Error();
                                error.code = 'invalid_auth';
                                fetchUserConversationStub.callsFake(() => {
                                    return () => Promise.reject(error);
                                });

                                const props = {
                                    appId: hat()
                                };

                                return WebMessenger.init(props).then(() => {
                                    fetchConfigStub.should.have.been.calledOnce;
                                    loginStub.should.not.have.been.called;
                                    renderStub.should.have.been.calledOnce;

                                    setAuthStub.should.have.been.calledOnce;
                                    setUserStub.should.have.been.calledOnce;

                                    resetUserStub.should.have.been.calledOnce;
                                    resetAuthStub.should.have.been.calledOnce;

                                    removeItemStub.should.have.been.calledTwice;
                                    removeItemStub.should.have.been.calledWith(`${props.appId}.appUserId`);
                                    removeItemStub.should.have.been.calledWith(`${props.appId}.sessionToken`);

                                    fetchUserConversationStub.should.have.been.calledOnce;
                                });
                            });

                            it('should not reset local user data for a non invalid_auth error', () => {
                                const error = new Error();
                                error.code = 'bad_request';
                                fetchUserConversationStub.callsFake(() => {
                                    return () => Promise.reject(error);
                                });

                                const props = {
                                    appId: hat()
                                };

                                return WebMessenger.init(props)
                                    .should.be.rejected.then(() => {
                                    fetchConfigStub.should.have.been.calledOnce;
                                    loginStub.should.not.have.been.called;

                                    setAuthStub.should.have.been.calledOnce;
                                    setUserStub.should.have.been.calledOnce;

                                    renderStub.should.not.have.been.called;
                                    resetUserStub.should.not.have.been.called;
                                    resetAuthStub.should.not.have.been.called;
                                    removeItemStub.should.not.have.been.called;

                                    fetchUserConversationStub.should.have.been.calledOnce;
                                });
                            });
                        }
                    });

                    describe('auth user with jwt', () => {
                        it('should fetch config, call login, and render', () => {
                            const props = {
                                appId: 'some-app-id',
                                userId: 'some-id',
                                jwt: 'some-jwt'
                            };

                            return WebMessenger.init(props).then(() => {
                                fetchConfigStub.should.have.been.calledOnce;
                                loginStub.should.have.been.calledOnce;
                                renderStub.should.have.been.calledOnce;
                                fetchUserConversationStub.should.not.have.been.called;
                            });
                        });
                    });

                    describe('auth user with userId without jwt', () => {
                        it('should throw', () => {
                            const props = {
                                appId: 'some-app-id',
                                userId: 'some-id'
                            };

                            return WebMessenger.init(props).should.be.rejectedWith(Error, /provide a userId and a JWT/);
                        });
                    });

                    describe('auth user without userId with jwt', () => {
                        it('should throw', () => {
                            const props = {
                                appId: 'some-app-id',
                                userId: 'some-id'
                            };

                            return WebMessenger.init(props).should.be.rejectedWith(Error, /provide a userId and a JWT/);
                        });
                    });

                    describe('already initialized', () => {
                        const props = {
                            appId: 'some-app-id'
                        };

                        beforeEach(() => {
                            mockedStore = mockAppStore(sandbox, generateBaseStoreProps({
                                appState: {
                                    isInitialized: true
                                }
                            }));
                        });

                        it('should reject', () => {
                            return WebMessenger.init(props).should.be.rejectedWith(Error, /already initialized/);
                        });
                    });

                    describe('without appId', () => {
                        it('should throw', () => {
                            return WebMessenger.init().should.be.rejectedWith(Error, /provide an appId/);
                        });
                    });

                    describe('fetch config fails', () => {
                        beforeEach(() => {
                            fetchConfigStub = sandbox.stub().returnsAsyncThunk({
                                rejects: true
                            });
                            WebMessengerRewire('fetchConfig', fetchConfigStub);
                        });

                        it('should reset the store state', () => {
                            const props = {
                                appId: 'some-app-id'
                            };

                            return WebMessenger.init(props).should.be.rejected.then(() => {
                                cleanUpStub.should.have.been.calledOnce;
                            });
                        });
                    });
                });
            });
        });
    });

    describe('Login', () => {
        afterEach(() => {
            sandbox.restore();
        });

        describe('conversation started', () => {
            const state = Object.assign({}, defaultState);
            beforeEach(() => {
                mockedStore = mockAppStore(sandbox, state);
            });

            it('should call the login action', () => {
                return WebMessenger.login('some-id', 'some-jwt').then(() => {
                    loginStub.should.have.been.calledOnce;
                    loginStub.should.have.been.calledWith('some-id', 'some-jwt');
                });
            });

            it('should throw if missing props', () => {
                return Promise.all([
                    WebMessenger.login('some-id').should.be.rejectedWith(Error, /provide a userId and a jwt/),
                    WebMessenger.login(undefined, 'some-jwt').should.be.rejectedWith(Error, /provide a userId and a jwt/),
                    WebMessenger.login().should.be.rejectedWith(Error, /provide a userId and a jwt/)
                ]);
            });
        });
    });

    describe('Send message', () => {
        beforeEach(() => {
            mockedStore = mockAppStore(sandbox, defaultState);

            sendMessageStub = sandbox.stub().returnsAsyncThunk({
                value: {}
            });
            WebMessengerRewire('_sendMessage', sendMessageStub);
        });

        it('should call the conversation action', () => {
            return WebMessenger.sendMessage('here is my message').then(() => {
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
                WebMessenger.getConversation().should.eq(mockedStore.getState().conversation);
            });
        });
    });

    describe('Update user', () => {
        beforeEach(() => {
            updateUserStub.returnsAsyncThunk({
                value: {
                    appUser: {
                        conversationStarted: false
                    }
                }
            });
        });

        it('should call the user action', () => {
            return WebMessenger.updateUser({
                email: 'update@me.com'
            }).then(() => {
                updateUserStub.should.have.been.calledWith({
                    email: 'update@me.com'
                });
            });
        });
    });

    describe('Logout', () => {
        it('should call logout', () => {
            return WebMessenger.logout().then(() => {
                logoutStub.should.have.been.calledOnce;
            });
        });
    });

    describe('Open', () => {
        it('should dispatch open action', () => {
            WebMessenger.open();
            openWidgetStub.should.have.been.calledOnce;
        });
    });

    describe('Close', () => {
        it('should dispatch close action', () => {
            WebMessenger.close();
            closeWidgetStub.should.have.been.calledOnce;
        });
    });
});
