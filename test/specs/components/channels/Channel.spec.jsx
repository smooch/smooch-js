import sinon from 'sinon';
import TestUtils from 'react-dom/test-utils';

import ChannelPage from '../../../../src/frame/js/components/channels/ChannelPage';
import Channel, { __Rewire__ as ChannelRewire } from '../../../../src/frame/js/components/channels/Channel';
import { CHANNEL_DETAILS } from '../../../../src/frame/js/constants/channels';

import { mockComponent, wrapComponentWithStore } from '../../../utils/react';
import { generateBaseStoreProps, createMockedStore } from '../../../utils/redux';

const sandbox = sinon.sandbox.create();

describe('Channel Component', () => {
    let getAppChannelDetailsStub;

    beforeEach(() => {
        mockComponent(sandbox, ChannelPage, 'div', {
            className: 'channel-page'
        });
        Object.keys(CHANNEL_DETAILS).forEach((key) => {
            const details = CHANNEL_DETAILS[key];
            if (details.Component && details.name !== 'SMS') {
                mockComponent(sandbox, details.Component, 'div', {
                    className: key
                });
            }
        });

        getAppChannelDetailsStub = sandbox.stub().returns([]);
        ChannelRewire('getAppChannelDetails', getAppChannelDetailsStub);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should render container without children if no channels', () => {
        const store = createMockedStore(sandbox, generateBaseStoreProps({
            user: {
                _id: 'some-user-id'
            }
        }));
        const component = wrapComponentWithStore(Channel, null, store);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-pages-container').length.should.be.eq(1);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-page').length.should.be.eq(0);
    });

    it('should render page if channel is not linked and has component', () => {
        const storeProps = generateBaseStoreProps({
            config: {
                integrations: [
                    {
                        type: 'frontendEmail',
                        linkColor: '#ddd',
                        fromAddress: 'some@email.com'
                    }
                ]
            },
            appState: {
                visibleChannelType: 'frontendEmail'
            },
            user: {
                _id: '12345',
                clients: [
                    {
                        platform: 'web'
                    }
                ]
            }
        });
        const store = createMockedStore(sandbox, storeProps);

        getAppChannelDetailsStub.returns([
            {
                channel: {
                    type: 'frontendEmail',
                    linkColor: '#ddd',
                    fromAddress: 'some@email.com'
                },
                details: CHANNEL_DETAILS.frontendEmail
            }
        ]);

        const component = wrapComponentWithStore(Channel, null, store);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-pages-container').length.should.be.eq(1);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-page').length.should.be.eq(1);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'frontendEmail').length.should.be.eq(1);
    });

    it('should not render page if channel is linked and has component', () => {
        const storeProps = generateBaseStoreProps({
            config: {
                integrations: [
                    {
                        type: 'frontendEmail',
                        linkColor: '#ddd',
                        fromAddress: 'some@email.com'
                    }
                ]
            },
            appState: {
                visibleChannelType: 'frontendEmail'
            },
            user: {
                _id: '12345',
                clients: [
                    {
                        platform: 'web'
                    },
                    {
                        platform: 'frontendEmail'
                    }
                ]
            }
        });

        const store = createMockedStore(sandbox, storeProps);

        getAppChannelDetailsStub.returns([
            {
                channel: {
                    type: 'frontendEmail',
                    linkColor: '#ddd',
                    fromAddress: 'some@email.com'
                },
                details: CHANNEL_DETAILS.frontendEmail
            }
        ]);

        const component = wrapComponentWithStore(Channel, null, store);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-pages-container').length.should.be.eq(1);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-page').length.should.be.eq(0);
    });

    it('should render page if channel is linked, has component, and is marked as render when linked', () => {
        const storeProps = generateBaseStoreProps({
            config: {
                integrations: [
                    {
                        type: 'wechat'
                    }
                ]
            },
            integrations: {
                wechat: {}
            },
            appState: {
                visibleChannelType: 'wechat'
            },
            user: {
                _id: '12345',
                clients: [
                    {
                        platform: 'web'
                    },
                    {
                        platform: 'wechat'
                    }
                ]
            }
        });

        const store = createMockedStore(sandbox, storeProps);

        getAppChannelDetailsStub.returns([
            {
                channel: {
                    type: 'wechat'
                },
                details: CHANNEL_DETAILS.wechat
            }
        ]);

        const component = wrapComponentWithStore(Channel, null, store);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-pages-container').length.should.be.eq(1);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'channel-page').length.should.be.eq(1);
        TestUtils.scryRenderedDOMComponentsWithClass(component, 'wechat').length.should.be.eq(1);
    });


});
