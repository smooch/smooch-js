import isMobile from 'ismobilejs';

import { integrations as integrationsAssets } from '../constants/assets';

import { fetchViberQRCode, fetchWeChatQRCode, fetchTwilioAttributes } from '../services/integrations';

import { EmailChannelContent } from '../components/channels/email-channel-content';
import { TwilioChannelContent } from '../components/channels/twilio-channel-content';
import { WeChatChannelContent } from '../components/channels/wechat-channel-content';
import { ViberChannelContent } from '../components/channels/viber-channel-content';
import { LineChannelContent } from '../components/channels/line-channel-content';

export const CHANNEL_DETAILS = {
    messenger: {
        name: 'Facebook Messenger',
        descriptionKey: 'messengerChannelDescription',
        isLinkable: true,
        usesCode: true,
        ...integrationsAssets.messenger,
        getURL: ({channel, code}) => `https://m.me/${channel.pageId}?ref=${code}`
    },
    frontendEmail: {
        name: 'Email',
        descriptionKey: 'frontendEmailChannelDescription',
        isLinkable: false,
        ...integrationsAssets.frontendEmail,
        Component: EmailChannelContent
    },
    twilio: {
        name: 'SMS',
        getDescription: ({text, pendingClient}) => {
            if (pendingClient) {
                return text.smsChannelPendingDescription.replace('{number}', pendingClient.displayName);
            }

            return text.smsChannelDescription;
        },
        isLinkable: true,
        ...integrationsAssets.sms,
        renderPageIfLinked: true,
        Component: TwilioChannelContent,
        onChannelPage: fetchTwilioAttributes
    },
    telegram: {
        name: 'Telegram',
        descriptionKey: 'telegramChannelDescription',
        isLinkable: true,
        usesCode: true,
        ...integrationsAssets.telegram,
        getURL: ({channel, code, linked}) => {
            const query = linked ? '' : `?start=${code}`;
            return `https://telegram.me/${channel.username}${query}`
        }
    },
    viber: {
        name: 'Viber',
        descriptionHtmlKey: 'viberChannelDescription',
        isLinkable: true,
        usesCode: true,
        ...integrationsAssets.viber,
        Component: !isMobile.any ? ViberChannelContent : undefined,
        onChannelPage: fetchViberQRCode,
        getURL: ({channel, code}) => {
            return isMobile.any ? `viber://pa?chatURI=${channel.uri}&context=${code}` : undefined;
        },
        renderPageIfLinked: !isMobile.any
    },
    wechat: {
        name: 'WeChat',
        descriptionHtmlKey: isMobile.any ? 'wechatChannelDescriptionMobile' : 'wechatChannelDescription',
        isLinkable: true,
        ...integrationsAssets.wechat,
        Component: WeChatChannelContent,
        onChannelPage: fetchWeChatQRCode,
        renderPageIfLinked: true
    },
    line: {
        name: 'LINE',
        descriptionKey: 'lineChannelDescription',
        isLinkable: false,
        ...integrationsAssets.line,
        Component: !isMobile.any ? LineChannelContent : undefined,
        getURL: ({channel}) => Promise.resolve(`https://line.me/R/ti/p/@${channel.lineId}`)
    }
};

Object.keys(CHANNEL_DETAILS).forEach((key) => {
    CHANNEL_DETAILS[key] = {
        renderPageIfLinked: false,
        getURL: () => {
        },
        onChannelPage: () => () => Promise.resolve(),
        ...CHANNEL_DETAILS[key]
    };
});
