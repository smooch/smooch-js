import sinon from 'sinon';

import { createMock } from '../../mocks/core';
import { createMockedStore, generateBaseStoreProps } from '../../utils/redux';

import { createTransaction, getAccount, __Rewire__ as StripeRewire } from '../../../src/frame/js/actions/stripe';

describe('Stripe Actions', () => {
    let sandbox;
    let coreMock;
    let mockedStore;

    before(() => {
        sandbox = sinon.sandbox.create();
    });

    beforeEach(() => {
        mockedStore = createMockedStore(sandbox, generateBaseStoreProps({
            user: {
                _id: '1'
            }
        }));

        coreMock = createMock(sandbox);
        StripeRewire('core', () => coreMock);
        coreMock.appUsers.stripe.createTransaction.resolves();
        coreMock.stripe.getAccount.resolves();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('createTransaction', () => {
        it('should call smooch-core appUser stripe api', () => {
            return mockedStore.dispatch(createTransaction('actionId', 'token')).then(() => {
                coreMock.appUsers.stripe.createTransaction.should.have.been.calledWith('1', 'actionId', 'token');
            });
        });
    });

    describe('getAccount', () => {
        it('should call smooch-core stripe api', () => {
            return mockedStore.dispatch(getAccount()).then(() => {
                coreMock.stripe.getAccount.should.have.been.calledOnce;
            });
        });
    });
});
