import http from '@/axios/index.js';

export function previewList() {
    return http.get('/preview/list');
}

export function previewCreate(email, expireTime = null) {
    return http.post('/preview/create', { email, expireTime });
}

export function previewExpire(previewId, days) {
    return http.put('/preview/expire', { previewId, days });
}

export function previewDelete(previewId) {
    return http.delete('/preview/delete', { params: { previewId } });
}

export function previewPageList(token, emailId, size = 20, timeSort = 0, type = 0) {
    return http.get('/preview/page/list', { params: { token, emailId, size, timeSort, type }, noMsg: true });
}
