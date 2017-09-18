import { core } from '../utils/core';

export const SET_AUTH = 'SET_AUTH';
export const RESET_AUTH = 'RESET_AUTH';

export function login(props) {
    return (dispatch, getState) => {
        return core(getState()).appUsers.init(props);
    };
}

export function setAuth(props) {
    return {
        type: SET_AUTH,
        props: props
    };
}

export function resetAuth() {
    return {
        type: RESET_AUTH
    };
}
