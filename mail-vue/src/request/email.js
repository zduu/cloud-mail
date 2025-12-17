import http from '@/axios/index.js';

export function emailList(accountId, emailId, timeSort, size, type, allAccount = 0) {
    return http.get('/email/list', {params: {accountId, emailId, timeSort, size, type, allAccount}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allAccount = 0) {
    return http.get('/email/latest', {params: {emailId, accountId, allAccount}, noMsg: true })
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds}, {noMsg: true})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
