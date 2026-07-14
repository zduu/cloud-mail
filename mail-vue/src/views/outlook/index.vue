<template>
  <div class="outlook-page">
    <aside class="account-panel">
      <div class="panel-header">
        <div class="panel-title">
          <Icon icon="mdi:microsoft-outlook" width="22" height="22"/>
          <span>{{ $t('outlookMailbox') }}</span>
        </div>
        <el-button type="primary" circle @click="openCreate">
          <Icon icon="material-symbols:add-rounded" width="18" height="18"/>
        </el-button>
      </div>

      <el-scrollbar class="account-scroll">
        <div
            v-for="item in accounts"
            :key="item.outlookAccountId"
            class="account-row"
            :class="{ active: currentAccount?.outlookAccountId === item.outlookAccountId }"
            @click="selectAccount(item)"
        >
          <div class="account-main">
            <div class="account-email">{{ item.email }}</div>
            <div class="account-meta">
              <el-tag size="small" :type="item.status === 'active' ? 'success' : 'info'">
                {{ item.status === 'active' ? $t('active') : $t('disabled') }}
              </el-tag>
              <span v-if="item.lastRefreshStatus">{{ item.lastRefreshStatus }}</span>
            </div>
          </div>
          <el-dropdown trigger="click" @click.stop>
            <el-button link>
              <Icon icon="lucide:more-horizontal" width="18" height="18"/>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="openEdit(item)">{{ $t('change') }}</el-dropdown-item>
                <el-dropdown-item @click="testAccount(item)">{{ $t('testConnection') }}</el-dropdown-item>
                <el-dropdown-item @click="deleteAccount(item)">{{ $t('delete') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <el-empty v-if="!accountLoading && accounts.length === 0" :description="$t('noOutlookAccount')"/>
      </el-scrollbar>
    </aside>

    <main class="mail-panel">
      <div class="mail-toolbar">
        <el-segmented v-model="folder" :options="folderOptions" @change="reloadMails"/>
        <div class="mail-actions">
          <el-button :disabled="!currentAccount" @click="reloadMails">
            <Icon icon="ion:reload" width="16" height="16"/>
          </el-button>
          <el-button :disabled="selectedMessageIds.length === 0" @click="setSelectedRead(true)">
            <Icon icon="lucide:mail-open" width="16" height="16"/>
            <span>{{ $t('markRead') }}</span>
          </el-button>
          <el-button :disabled="selectedMessageIds.length === 0" @click="setSelectedRead(false)">
            <Icon icon="lucide:mail" width="16" height="16"/>
            <span>{{ $t('markUnread') }}</span>
          </el-button>
        </div>
      </div>

      <el-table
          v-loading="mailLoading"
          :data="messages"
          height="calc(100vh - 148px)"
          style="width: 100%"
          @selection-change="rows => selectedRows = rows"
          @row-click="openMessage"
      >
        <el-table-column type="selection" width="46"/>
        <el-table-column :label="$t('sender')" min-width="190">
          <template #default="scope">
            <div class="sender-cell" :class="{ unread: !scope.row.isRead }">
              {{ scope.row.from?.name || scope.row.from?.address || $t('unknown') }}
            </div>
            <div class="sender-address">{{ scope.row.from?.address }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="$t('subject')" min-width="320">
          <template #default="scope">
            <div class="subject-cell" :class="{ unread: !scope.row.isRead }">
              <Icon v-if="scope.row.hasAttachments" icon="lucide:paperclip" width="15" height="15"/>
              <span>{{ scope.row.subject || $t('noSubject') }}</span>
            </div>
            <div class="preview-cell">{{ scope.row.bodyPreview }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="receivedDateTime" :label="$t('date')" width="180"/>
      </el-table>

      <div class="mail-footer">
        <el-button :disabled="!currentAccount || skip === 0" @click="prevPage">{{ $t('prevPage') }}</el-button>
        <span>{{ skip + 1 }} - {{ skip + messages.length }}</span>
        <el-button :disabled="!currentAccount || messages.length < pageSize" @click="nextPage">{{ $t('nextPage') }}</el-button>
      </div>
    </main>

    <el-dialog v-model="accountDialog" :title="form.outlookAccountId ? $t('changeOutlookAccount') : $t('addOutlookAccount')" width="680px">
      <div class="account-form">
        <el-input
            v-model="form.accountString"
            type="textarea"
            :rows="3"
            :placeholder="$t('outlookAccountStringPlaceholder')"
        />
        <div class="splitter">{{ $t('or') }}</div>
        <el-input v-model="form.email" :placeholder="$t('emailAccount')"/>
        <el-input v-model="form.password" :placeholder="$t('password')" show-password/>
        <el-input v-model="form.clientId" placeholder="client_id"/>
        <el-input v-model="form.refreshToken" type="textarea" :rows="3" placeholder="refresh_token"/>
        <el-input v-model="form.remark" :placeholder="$t('description')"/>
      </div>
      <template #footer>
        <el-button @click="accountDialog = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveAccount">{{ $t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="messageDrawer" :title="detail?.subject || $t('noSubject')" size="72%">
      <div v-loading="detailLoading" class="message-detail">
        <div v-if="detail" class="detail-head">
          <div><strong>{{ $t('from') }}:</strong> {{ formatAddress(detail.from?.emailAddress) }}</div>
          <div><strong>{{ $t('recipient') }}:</strong> {{ formatAddressList(detail.toRecipients) }}</div>
          <div><strong>{{ $t('date') }}:</strong> {{ detail.receivedDateTime }}</div>
          <div class="detail-actions">
            <el-button @click="setDetailRead(!detail.isRead)">
              <Icon :icon="detail.isRead ? 'lucide:mail' : 'lucide:mail-open'" width="16" height="16"/>
              <span>{{ detail.isRead ? $t('markUnread') : $t('markRead') }}</span>
            </el-button>
          </div>
        </div>

        <div v-if="attachments.length" class="attachment-list">
          <div class="attachment-title">{{ $t('attachments') }}</div>
          <div v-for="att in attachments" :key="att.id" class="attachment-row">
            <Icon icon="lucide:paperclip" width="16" height="16"/>
            <span>{{ att.name }}</span>
            <span class="attachment-size">{{ formatSize(att.size) }}</span>
            <el-button link type="primary" @click="downloadAttachment(att)">{{ $t('download') }}</el-button>
          </div>
        </div>

        <iframe v-if="detail" class="message-frame" sandbox :srcdoc="detailHtml"></iframe>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {computed, reactive, ref} from "vue";
import {useI18n} from "vue-i18n";
import {
  outlookAccountDelete,
  outlookAccountDetail,
  outlookAccountList,
  outlookAccountSave,
  outlookAccountTest,
  outlookDownloadAttachment,
  outlookMailAttachments,
  outlookMailDetail,
  outlookMailList,
  outlookMailRead
} from "@/request/outlook.js";
import {sanitizeEmailHtml} from '@/utils/sanitize-email-html.js';

const {t} = useI18n();

const accounts = ref([]);
const currentAccount = ref(null);
const messages = ref([]);
const selectedRows = ref([]);
const attachments = ref([]);
const detail = ref(null);

const accountLoading = ref(false);
const mailLoading = ref(false);
const saving = ref(false);
const detailLoading = ref(false);
const accountDialog = ref(false);
const messageDrawer = ref(false);

const folder = ref('inbox');
const skip = ref(0);
const pageSize = 30;

const form = reactive({
  outlookAccountId: 0,
  accountString: '',
  email: '',
  password: '',
  clientId: '',
  refreshToken: '',
  remark: ''
});

const folderOptions = computed(() => [
  {label: t('inbox'), value: 'inbox'},
  {label: t('junkEmail'), value: 'junkemail'},
  {label: t('sent'), value: 'sentitems'},
  {label: t('drafts'), value: 'drafts'},
  {label: t('deletedItems'), value: 'deleteditems'}
]);

const selectedMessageIds = computed(() => selectedRows.value.map(row => row.id));

const detailHtml = computed(() => {
  const body = sanitizeEmailHtml(detail.value?.body?.content || '');
  return `<!doctype html><html><head><base target="_blank"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1f2937;margin:0;padding:16px;word-break:break-word}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${body}</body></html>`;
});

loadAccounts();

async function loadAccounts() {
  accountLoading.value = true;
  try {
    const selectedId = currentAccount.value?.outlookAccountId;
    accounts.value = await outlookAccountList();
    if (selectedId) {
      currentAccount.value = accounts.value.find(item => item.outlookAccountId === selectedId) || null;
      if (!currentAccount.value) {
        messages.value = [];
        selectedRows.value = [];
        skip.value = 0;
      }
    }
  } finally {
    accountLoading.value = false;
  }
}

function resetForm() {
  form.outlookAccountId = 0;
  form.accountString = '';
  form.email = '';
  form.password = '';
  form.clientId = '';
  form.refreshToken = '';
  form.remark = '';
}

function openCreate() {
  resetForm();
  accountDialog.value = true;
}

async function openEdit(account) {
  resetForm();
  const data = await outlookAccountDetail(account.outlookAccountId);
  form.outlookAccountId = data.outlookAccountId;
  form.email = data.email || '';
  form.password = data.password || '';
  form.clientId = data.clientId || '';
  form.refreshToken = data.refreshToken || '';
  form.remark = data.remark || '';
  accountDialog.value = true;
}

async function saveAccount() {
  saving.value = true;
  try {
    const saved = await outlookAccountSave({
      outlookAccountId: form.outlookAccountId || undefined,
      accountString: form.accountString,
      email: form.email,
      password: form.password,
      clientId: form.clientId,
      refreshToken: form.refreshToken,
      remark: form.remark
    });
    accountDialog.value = false;
    ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true});
    await loadAccounts();
    const target = accounts.value.find(item => item.outlookAccountId === saved.outlookAccountId);
    if (target) {
      currentAccount.value = target;
      messages.value = [];
      selectedRows.value = [];
      skip.value = 0;
    }
  } finally {
    saving.value = false;
  }
}

async function deleteAccount(account) {
  await ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {type: 'warning'});
  await outlookAccountDelete(account.outlookAccountId);
  ElMessage({message: t('delSuccessMsg'), type: 'success', plain: true});
  if (currentAccount.value?.outlookAccountId === account.outlookAccountId) {
    currentAccount.value = null;
    messages.value = [];
  }
  await loadAccounts();
}

async function testAccount(account) {
  await outlookAccountTest(account.outlookAccountId);
  ElMessage({message: t('testSuccess'), type: 'success', plain: true});
  await loadAccounts();
}

async function selectAccount(account) {
  currentAccount.value = account;
  skip.value = 0;
  await reloadMails();
}

async function reloadMails() {
  if (!currentAccount.value) return;
  mailLoading.value = true;
  selectedRows.value = [];
  try {
    const data = await outlookMailList({
      outlookAccountId: currentAccount.value.outlookAccountId,
      folder: folder.value,
      skip: skip.value,
      top: pageSize
    });
    messages.value = data.list || [];
  } finally {
    mailLoading.value = false;
  }
}

async function prevPage() {
  skip.value = Math.max(0, skip.value - pageSize);
  await reloadMails();
}

async function nextPage() {
  skip.value += pageSize;
  await reloadMails();
}

async function setSelectedRead(isRead) {
  if (!currentAccount.value || selectedMessageIds.value.length === 0) return;
  await outlookMailRead({
    outlookAccountId: currentAccount.value.outlookAccountId,
    messageIds: selectedMessageIds.value,
    isRead
  });
  await reloadMails();
}

async function openMessage(row) {
  if (!currentAccount.value) return;
  messageDrawer.value = true;
  detailLoading.value = true;
  attachments.value = [];
  detail.value = null;
  try {
    detail.value = await outlookMailDetail({
      outlookAccountId: currentAccount.value.outlookAccountId,
      messageId: row.id
    });
    if (!detail.value.isRead) {
      await outlookMailRead({
        outlookAccountId: currentAccount.value.outlookAccountId,
        messageId: row.id,
        isRead: true
      });
      row.isRead = true;
      detail.value.isRead = true;
    }
    if (detail.value.hasAttachments) {
      attachments.value = await outlookMailAttachments({
        outlookAccountId: currentAccount.value.outlookAccountId,
        messageId: row.id
      });
    }
  } finally {
    detailLoading.value = false;
  }
}

async function setDetailRead(isRead) {
  if (!currentAccount.value || !detail.value?.id) return;
  await outlookMailRead({
    outlookAccountId: currentAccount.value.outlookAccountId,
    messageId: detail.value.id,
    isRead
  });
  detail.value.isRead = isRead;
  const row = messages.value.find(item => item.id === detail.value.id);
  if (row) row.isRead = isRead;
}

async function downloadAttachment(att) {
  if (!currentAccount.value || !detail.value?.id) return;
  try {
    const {blob, filename} = await outlookDownloadAttachment({
      outlookAccountId: currentAccount.value.outlookAccountId,
      messageId: detail.value.id,
      attachmentId: att.id
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage({message: e.message || t('reqFailErrorMsg'), type: 'error', plain: true});
  }
}

function formatAddress(address) {
  if (!address) return '';
  return address.name ? `${address.name} <${address.address}>` : address.address;
}

function formatAddressList(list = []) {
  return list.map(item => formatAddress(item.emailAddress)).filter(Boolean).join(', ');
}

function formatSize(size) {
  const num = Number(size || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<style scoped lang="scss">
.outlook-page {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
}

.account-panel {
  border-right: 1px solid var(--el-border-color-lighter);
  min-width: 0;
  overflow: hidden;
}

.panel-header,
.mail-toolbar,
.mail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.panel-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  font-weight: 600;
}

.account-scroll {
  height: calc(100vh - 70px);
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.account-row.active {
  background: var(--el-fill-color-light);
}

.account-main {
  flex: 1;
  min-width: 0;
}

.account-email,
.sender-cell,
.subject-cell {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.account-email {
  font-weight: 600;
}

.account-meta,
.sender-address,
.preview-cell,
.attachment-size {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.account-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.mail-panel {
  min-width: 0;
  overflow: hidden;
}

.mail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.subject-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.unread {
  font-weight: 700;
}

.mail-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 0;
}

.account-form {
  display: grid;
  gap: 12px;
}

.splitter {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;
}

.message-detail {
  min-height: calc(100vh - 90px);
}

.detail-head {
  display: grid;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-actions {
  margin-top: 4px;
}

.attachment-list {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.attachment-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.attachment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.message-frame {
  width: 100%;
  height: calc(100vh - 250px);
  border: 0;
}

@media (max-width: 900px) {
  .outlook-page {
    grid-template-columns: 1fr;
  }

  .account-panel {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .account-scroll {
    height: 180px;
  }

  .mail-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .mail-actions {
    flex-wrap: wrap;
  }
}
</style>
