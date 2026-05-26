import http from '@/axios/index.js';

export function outlookAccountList() {
    return http.get('/outlook/account/list');
}

export function outlookAccountDetail(outlookAccountId) {
    return http.get('/outlook/account/detail', { params: { outlookAccountId } });
}

export function outlookAccountSave(data) {
    return http.post('/outlook/account/save', data);
}

export function outlookAccountDelete(outlookAccountId) {
    return http.delete('/outlook/account/delete', { params: { outlookAccountId } });
}

export function outlookAccountTest(outlookAccountId) {
    return http.post('/outlook/account/test', { outlookAccountId });
}

export function outlookMailList(params) {
    return http.get('/outlook/mail/list', { params });
}

export function outlookMailDetail(params) {
    return http.get('/outlook/mail/detail', { params });
}

export function outlookMailRead(data) {
    return http.put('/outlook/mail/read', data);
}

export function outlookMailAttachments(params) {
    return http.get('/outlook/mail/attachments', { params });
}

export async function outlookDownloadAttachment(params) {
    const query = new URLSearchParams(params);
    const baseUrl = import.meta.env.VITE_BASE_URL || '';
    const response = await fetch(`${baseUrl}/outlook/mail/attachment?${query.toString()}`, {
        headers: {
            Authorization: `${localStorage.getItem('token')}`
        }
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.message || response.statusText);
        }
    }

    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'attachment';
    return {
        filename,
        blob: await response.blob()
    };
}
