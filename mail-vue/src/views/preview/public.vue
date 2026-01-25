<template>
  <div class="preview-page">
    <div class="preview-header">
      <div class="mailbox">
        <Icon icon="mingcute:mail-open-line" width="22" height="22"/>
        <span class="mailbox-email">{{ mailboxEmail || t('previewEmail') }}</span>
      </div>
      <div class="share">
        <el-input v-model="shareLink" readonly size="small" class="share-input">
          <template #append>
            <el-button @click="copyLink">{{ t('copyLink') }}</el-button>
          </template>
        </el-input>
      </div>
    </div>

    <div v-if="errorMsg" class="error">
      {{ errorMsg }}
    </div>

    <div v-else class="preview-body">
      <div class="list-panel">
        <el-skeleton v-if="loading && emails.length === 0" animated :count="3">
          <template #template>
            <div class="skeleton-row"></div>
          </template>
        </el-skeleton>

        <template v-else-if="emails.length === 0">
          <el-empty :description="t('noMessagesFound')"/>
        </template>

        <div v-else class="email-list">
          <div
              v-for="item in emails"
              :key="item.emailId"
              class="email-item"
              :class="item.emailId === selectedEmailId ? 'active' : ''"
              @click="selectEmail(item)"
          >
            <div class="email-title">
              <span class="subject">{{ item.subject || t('noSubject') }}</span>
              <span class="time">{{ formatTime(item.createTime) }}</span>
            </div>
            <div class="email-meta">
              <span class="from">{{ item.name }} <{{ item.sendEmail }}></span>
            </div>
          </div>
        </div>

        <div class="load-more" v-if="emails.length < total">
          <el-button :loading="loadMoreLoading" @click="loadMore">{{ t('loadMore') }}</el-button>
        </div>
      </div>

      <div class="detail-panel">
        <template v-if="currentEmail">
          <div class="detail-head">
            <div class="subject">{{ currentEmail.subject || t('noSubject') }}</div>
            <div class="meta">
              <span class="from">{{ currentEmail.name }} <{{ currentEmail.sendEmail }}></span>
              <span class="time">{{ formatTime(currentEmail.createTime) }}</span>
            </div>
          </div>
          <div class="detail-body" v-html="formatContent(currentEmail.content || '')"></div>
          <div class="detail-text" v-if="!currentEmail.content && currentEmail.text">
            <pre>{{ currentEmail.text }}</pre>
          </div>
        </template>
        <template v-else>
          <el-empty :description="t('noMessagesFound')"/>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import {computed, onMounted, ref} from "vue";
import {useRoute} from "vue-router";
import {previewPageList} from "@/request/preview.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {toOssDomain} from "@/utils/convert.js";
import {formatDetailDate} from "@/utils/day.js";
import {Icon} from "@iconify/vue";

const route = useRoute();
const {t} = useI18n();
const settingStore = useSettingStore();

const emails = ref([]);
const total = ref(0);
const loading = ref(false);
const loadMoreLoading = ref(false);
const errorMsg = ref('');
const selectedEmailId = ref(null);
const mailboxEmail = ref('');

const token = computed(() => route.params.token);
const shareLink = computed(() => `${window.location.origin}/preview/mail/${token.value}`);

const currentEmail = computed(() => emails.value.find(item => item.emailId === selectedEmailId.value));

onMounted(() => {
  fetchEmails(true);
});

function formatTime(time) {
  return formatDetailDate(time);
}

function formatContent(content) {
  const domain = settingStore.settings.r2Domain;
  return (content || '').replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function selectEmail(email) {
  selectedEmailId.value = email.emailId;
}

async function fetchEmails(reset = false) {
  if (loading.value || loadMoreLoading.value) return;

  loading.value = reset;
  loadMoreLoading.value = !reset;

  try {
    const lastId = reset ? 0 : (emails.value.at(-1)?.emailId || 0);
    const data = await previewPageList(token.value, lastId);
    mailboxEmail.value = data.email;
    total.value = data.total;
    if (reset) {
      emails.value = data.list || [];
    } else {
      emails.value.push(...data.list || []);
    }

    if (!selectedEmailId.value && emails.value.length > 0) {
      selectedEmailId.value = emails.value[0].emailId;
    }
  } catch (e) {
    errorMsg.value = e.message || t('previewInvalid');
  } finally {
    loading.value = false;
    loadMoreLoading.value = false;
  }
}

function loadMore() {
  fetchEmails(false);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    });
  } catch (e) {
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    });
  }
}
</script>

<style scoped lang="scss">
.preview-page {
  min-height: 100vh;
  padding: 20px;
  background: radial-gradient(circle at 10% 20%, #f0f6ff 0%, #ffffff 35%), radial-gradient(circle at 90% 10%, #f6f2ff 0%, #ffffff 30%);
}

.preview-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;

  .mailbox {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
    font-size: 18px;
  }

  .mailbox-email {
    color: var(--el-color-primary);
  }

  .share {
    flex: 1;
    min-width: 260px;
  }

  @media (max-width: 600px) {
    flex-direction: column;
    align-items: stretch;

    .share {
      min-width: 0;
      width: 100%;
    }
  }
}

.preview-body {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 14px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.list-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  padding: 12px;
  box-shadow: var(--el-box-shadow-light);
  min-width: 0;
}

.email-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 70vh;
  overflow-y: auto;
}

.email-item {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  cursor: pointer;
  background: var(--el-fill-color-light);
  transition: all 0.2s;
  min-width: 0;

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.email-title {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-width: 0;

  .subject {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .time {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    white-space: nowrap;
  }
}

@media (max-width: 520px) {
  .email-title {
    flex-wrap: wrap;
  }

  .email-title .subject {
    flex: 1 1 100%;
  }

  .email-title .time {
    flex: 0 0 auto;
  }
}

.email-meta {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-panel {
  background: #fff;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  padding: 16px;
  min-height: 70vh;
  box-shadow: var(--el-box-shadow-light);
  overflow: hidden;
  min-width: 0;

  @media (max-width: 900px) {
    min-height: auto;
  }
}

.detail-head {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color);
  padding-bottom: 10px;

  .subject {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.detail-body {
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
  overflow-x: auto;
  overflow-wrap: anywhere;

  img {
    max-width: 100%;
    height: auto;
  }
}

:deep(.detail-body *) {
  max-width: 100%;
  box-sizing: border-box;
}

:deep(.detail-body table) {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed;
}

:deep(.detail-body th),
:deep(.detail-body td) {
  word-break: break-word;
}

:deep(.detail-body img),
:deep(.detail-body video),
:deep(.detail-body iframe) {
  max-width: 100%;
  height: auto;
}

:deep(.detail-body pre),
:deep(.detail-body code) {
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-text pre {
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.6;
}

.error {
  padding: 12px;
  color: #c45656;
  border: 1px solid #fbc4c4;
  background: #fef0f0;
  border-radius: 8px;
}

.skeleton-row {
  height: 52px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.load-more {
  margin-top: 10px;
  text-align: center;
}
</style>
