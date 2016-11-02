import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';

export class EmailChannelContentComponent extends Component {
    static propTypes = {
        linkColor: PropTypes.string,
        fromAddress: PropTypes.string,
        smoochAddress: PropTypes.string.isRequired
    };

    render() {
        const {linkColor, fromAddress, smoochAddress} = this.props;
        const email = fromAddress || smoochAddress;

        const styleOverride = linkColor ? {
            color: `#${linkColor}`
        } : null;

        return <a href={ `mailto:${email}` }
                  style={ styleOverride }
                  target='_blank'>
                   { email }
               </a>;
    }
}

export const EmailChannelContent = connect(({app}) => {
    return {
        linkColor: app.settings.web.linkColor
    };
})(EmailChannelContentComponent);
