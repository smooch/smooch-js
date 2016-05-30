import React, { Component } from 'react';
import { findDOMNode } from 'react-dom';
import { connect } from 'react-redux';
import isMobile from 'ismobilejs';

import { createMarkup } from '../utils/html';
import { MessageComponent } from './message';
import { logo, logo2x } from '../utils/assets';

export class ConversationComponent extends Component {
    static defaultProps = {
        settings: {}
    };

    state = {
        logoIsAnchored: true
    };

    scrollTimeouts = [];

    onTouchStart = () => {
        // in embedded we need to let user scroll past the conversation
        if (!this.props.embedded) {
            const node = findDOMNode(this);
            const top = node.scrollTop;
            const totalScroll = node.scrollHeight;
            const currentScroll = top + node.offsetHeight;


            // this bit of code makes sure there's always something to scroll
            // in the conversation view so the page behind won't start scrolling
            // when hitting top or bottom.
            if (top === 0) {
                node.scrollTop = 1;
            } else if (currentScroll === totalScroll) {
                node.scrollTop = top - 1;
            }
        }

    };

    scrollToBottom = () => {
        const timeout = setTimeout(() => {
            const container = findDOMNode(this);
            const logo = this.refs.logo;
            const scrollTop = container.scrollHeight - container.clientHeight - logo.clientHeight;
            container.scrollTop = scrollTop;
        });
        this.scrollTimeouts.push(timeout);
    };

    componentDidMount() {
        this.scrollToBottom();
    }

    componentDidUpdate() {
        this.scrollToBottom();
    }

    componentWillUnmount() {
        this.scrollTimeouts.forEach(clearTimeout);
    }

    render() {
        const processedMessages = [...this.props.conversation.messages];
        let lastAuthor;
        processedMessages.forEach((message, index) => {
            const author = message.role === 'appUser' ? message.role : `${message.role}_${message.name}`;

            if (!lastAuthor) {
                lastAuthor = author;
                message.firstInGroup = true;
                message.lastInGroup = true;
            }

            if (lastAuthor === author) {
                if (index > 0) {
                    processedMessages[index - 1].lastInGroup = false;
                    message.lastInGroup = true;
                }
            } else {
                message.firstInGroup = true;
                message.lastInGroup = true;
            }

            lastAuthor = author;
        });

        const messages = processedMessages.map((message) => {

            return <MessageComponent key={ message._clientId || message._id }
                                     accentColor={ this.props.settings.accentColor }
                                     linkColor={ this.props.settings.linkColor }
                                     onLoad={ this.scrollToBottom }
                                     {...message} />;
        });

        const logoStyle = isMobile.apple.device ? {
            paddingBottom: 10
        } : undefined;

        return (
            <div id='sk-conversation'
                 ref='container'
                 onTouchStart={ this.onTouchStart }>
                <div ref='intro'
                     className='sk-intro'
                     dangerouslySetInnerHTML={ createMarkup(this.props.ui.text.introText) }></div>
                <div className='sk-messages-container'>
                    <div ref='messages'
                         className='sk-messages'>
                        { messages }
                    </div>
                    <div className='sk-logo'
                         ref='logo'
                         style={ logoStyle }>
                        <a href='https://smooch.io/live-web-chat/?utm_source=widget'
                           target='_blank'><span>Messaging by</span> <img className='sk-image'
                                                                                                                      src={ logo }
                                                                                                                      srcSet={ `${logo} 1x, ${logo2x} 2x` }
                                                                                                                      alt='smooch.io' /></a>
                    </div>
                </div>
            </div>
            );
    }
}

export const Conversation = connect((state) => {
    return {
        ui: state.ui,
        conversation: state.conversation,
        settings: state.app.settings && state.app.settings.web,
        embedded: state.appState.embedded
    };
})(ConversationComponent);
