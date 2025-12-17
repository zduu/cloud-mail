import { defineStore } from 'pinia'

export const useSettingStore = defineStore('setting', {
    state: () => ({
        domainList: [],
        loginDomainList: [],
        sendDomainList: [],
        settings: {
            r2Domain: '',
            loginOpacity: 1.00,
            sendDomainList: []
        },
        lang: '',
    }),
    actions: {

    }
})
