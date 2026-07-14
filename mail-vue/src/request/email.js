import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type, allAccount = 0) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type, allAccount}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive, allAccount = 0) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive, allAccount}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
