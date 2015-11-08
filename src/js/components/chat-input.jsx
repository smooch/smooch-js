import React, { Component } from 'react';
import { connect } from 'react-redux';
import { sendMessage } from '../services/conversation-service';

export class ChatInputComponent extends Component {
    constructor() {
        super();

        this.state = {
          text: ''
        };

        this.onChange = this.onChange.bind(this);
        this.sendMessage = this.sendMessage.bind(this);
    }

    onChange(e) {
      this.setState({
        text: e.target.value
      });
    }

    sendMessage(e) {
        e.preventDefault();
        const text = this.state.text;
        this.setState({text: ''});

        sendMessage(text);
    }

    render() {
        return (
            <div id="sk-footer">
                <form onSubmit={ this.sendMessage }>
                    <input placeholder={ this.props.ui.text.inputPlaceholder } className="input message-input" onChange={this.onChange} value={this.state.text}></input>
                    <a href="#" className="send" onClick={ this.sendMessage }>{ this.props.ui.text.sendButtonText }</a>
                </form>
            </div>
        );
    }
}

export const ChatInput = connect((state) => {
  return {
    ui: state.ui
  };
})(ChatInputComponent)
