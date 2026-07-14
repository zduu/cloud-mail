<template>
  <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :email-read="emailRead"
               :show-unread="true"
               actionLeft="4px"
               @jump="jumpContent"
  >
    <template #first>
      <el-radio-group class="scope-switch" v-model="mailScope" size="small" @change="handleScopeChange">
        <el-radio-button label="single">{{ $t('currentMailbox') }}</el-radio-button>
        <el-radio-button label="all">{{ $t('allMailboxes') }}</el-radio-button>
      </el-radio-group>
      <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
            v-if="params.timeSort === 0" width="28" height="28"/>
      <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
            width="28" height="28"/>
    </template>

    <template #name="{ email }">
      <span class="name-cell">
        <span v-if="isAllScope" class="account-tag">{{ email.accountEmail || email.toEmail }}</span>
        <span class="sender-name">{{ email.name }}</span>
      </span>
    </template>

  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {computed, defineOptions, onMounted, reactive, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import router from "@/router/index.js";
import {Icon} from "@iconify/vue";
import { useRoute } from 'vue-router'

defineOptions({
  name: 'email'
})

const route = useRoute();
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({})
const params = reactive({
  timeSort: 0,
})
const mailScope = ref('single')
const isAllScope = computed(() => mailScope.value === 'all')

onMounted(() => {
  emailStore.emailScroll = scroll;
  latest()
})


watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function handleScopeChange() {
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/message')
}

const existIds = new Set();

async function latest() {
  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    if (route.name !== 'email') {
      continue;
    }

    const latestId = scroll.value.latestEmail?.emailId

    if (!scroll.value.firstLoad && autoRefresh > 1) {
      try {
        const curScopeAll = isAllScope.value
        const accountId = curScopeAll ? 0 : accountStore.currentAccountId
        const allReceive = curScopeAll ? 1 : (scroll.value.latestEmail?.allReceive ?? accountStore.currentAccount?.allReceive ?? 0)
        const curTimeSort = params.timeSort
        let list = []

        //确保发起请求时最后一个邮件是当前账号的,或者
        if (curScopeAll || accountId === scroll.value.latestEmail?.reqAccountId || accountId === scroll.value.latestEmail?.accountId) {
          list = await emailLatest(latestId, accountId, allReceive, curScopeAll ? 1 : 0);
        }

        //确保请求回来后，账号、时间排序、范围和全部收件设置没有改变
        const accountNoChange = curScopeAll || accountId === accountStore.currentAccountId
        const allReceiveNoChange = curScopeAll || allReceive === accountStore.currentAccount?.allReceive

        if (accountNoChange && allReceiveNoChange && params.timeSort === curTimeSort && curScopeAll === isAllScope.value) {
          if (list.length > 0) {

            for (let email of list) {

              email.reqAccountId = accountId;
              email.allReceive = allReceive;

              if (!existIds.has(email.emailId)) {

                existIds.add(email.emailId)
                scroll.value.addItem(email)

                await sleep(50)
              }

            }

          }

        }
      } catch (e) {
        if (e.code === 401 || e.code === 403) {
          settingStore.settings.autoRefresh = 0;
        }
        console.error(e)
      }
    }
  }
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const allAccount = isAllScope.value ? 1 : 0
  const accountId = allAccount ? 0 : accountStore.currentAccountId
  const allReceive = allAccount ? 1 : (accountStore.currentAccount?.allReceive ?? 0)
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0, allAccount).then(data => {
    if (data.latestEmail) {
      data.latestEmail.reqAccountId = accountId;
      data.latestEmail.allReceive = allReceive;
    }
    return data;
  })
}

</script>
<style>
.icon {
  cursor: pointer;
}

.scope-switch {
  margin-right: 8px;
}

.name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.account-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  color: var(--secondary-text-color);
  font-size: 12px;
}

.sender-name {
  display: inline-flex;
  align-items: center;
}
</style>
