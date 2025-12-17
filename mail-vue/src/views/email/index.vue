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

defineOptions({
  name: 'email'
})

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
    const latestId = scroll.value.latestEmail?.emailId

    if (!scroll.value.firstLoad && settingStore.settings.autoRefreshTime) {
      try {
        const accountId = isAllScope.value ? 0 : accountStore.currentAccountId
        const curTimeSort = params.timeSort
        const curScopeAll = isAllScope.value
        let list = []

        //确保发起请求时最后一个邮件是当前账号的,或者
        if (curScopeAll || accountId === scroll.value.latestEmail?.accountId) {
          list = await emailLatest(latestId, accountId, curScopeAll ? 1 : 0);
        }

        //确保请求回来后，账号没有切换，时间排序没有改变
        const accountNoChange = curScopeAll || accountId === accountStore.currentAccountId

        if (accountNoChange && params.timeSort === curTimeSort && curScopeAll === isAllScope.value) {
          if (list.length > 0) {

            for (let email of list) {

              if (!existIds.has(email.emailId)) {

                existIds.add(email.emailId)
                scroll.value.addItem(email)

                if (innerWidth > 1367) {
                  ElNotification({
                    type: 'primary',
                    message: `<div style="cursor: pointer;"><div style="overflow: hidden;white-space: nowrap;text-overflow: ellipsis; font-weight: bold;font-size: 16px;margin-bottom: 5px;">${email.name}</div><div style="color: teal;">${email.subject}</div></div>`,
                    position: 'bottom-right',
                    dangerouslyUseHTMLString: true,
                    onClick: () => {
                      jumpContent(email);
                    }
                  })
                }

                await sleep(50)
              }

            }

          }

        }
      } catch (e) {
        console.error(e)
      }
    }
    await sleep(settingStore.settings.autoRefreshTime * 1000)
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
  return emailList(accountId, emailId, params.timeSort, size, 0, allAccount)
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
