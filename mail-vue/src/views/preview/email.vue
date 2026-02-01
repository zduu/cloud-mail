<template>
  <div class="preview-email-page">
    <div class="preview-header">
      <div class="title">
        <Icon icon="mingcute:mail-open-line" width="22" height="22"/>
        <span class="subject">{{ (email && email.subject) || t('noSubject') }}</span>
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
      <div class="detail-panel">
        <div v-if="loading" class="skeleton-block"></div>
        <template v-else-if="email">
          <div class="detail-head">
            <div class="time">{{ formatTime(email.createTime) }}</div>
          </div>
          <div class="detail-body">
            <ShadowHtml class="shadow-html" :html="formatContent(email.content)" v-if="email.content"/>
            <pre v-else class="detail-text">{{ email.text }}</pre>
          </div>
          <div class="att" v-if="email.attList && email.attList.length > 0">
            <div class="att-title">
              <span>{{ t('attachments') }}</span>
              <span>{{ t('attCount',{ total: email.attList.length }) }}</span>
            </div>
            <div class="att-box">
              <div class="att-item" v-for="att in email.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a :href="cvtR2Url(att.key)" download>
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <el-empty :description="t('noMessagesFound')"/>
        </template>
      </div>
    </div>

    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>

<script setup>
import {computed, onMounted, reactive, ref} from "vue";
import {useRoute} from "vue-router";
import {previewEmailDetail} from "@/request/preview.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {toOssDomain, cvtR2Url} from "@/utils/convert.js";
import {formatDetailDate} from "@/utils/day.js";
import {Icon} from "@iconify/vue";
import ShadowHtml from '@/components/shadow-html/index.vue';
import {getIconByName} from "@/utils/icon-utils.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";

const route = useRoute();
const {t} = useI18n();
const settingStore = useSettingStore();

const email = ref(null);
const loading = ref(false);
const errorMsg = ref('');
const showPreview = ref(false);
const srcList = reactive([]);

const token = computed(() => route.params.token);
const shareLink = computed(() => `${window.location.origin}/preview/email/${token.value}`);

onMounted(() => {
  fetchDetail();
});

function formatTime(time) {
  return formatDetailDate(time);
}

function formatContent(content) {
  const domain = settingStore.settings.r2Domain;
  return (content || '').replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

async function fetchDetail() {
  if (loading.value) return;
  loading.value = true;
  try {
    email.value = await previewEmailDetail(token.value);
  } catch (e) {
    errorMsg.value = e.message || t('previewInvalid');
  } finally {
    loading.value = false;
  }
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename));
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key);
  srcList.length = 0;
  srcList.push(url);
  showPreview.value = true;
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
.preview-email-page {
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

  .title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
    font-size: 18px;
  }

  .subject {
    color: var(--el-text-color-primary);
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
  grid-template-columns: 1fr;
  gap: 14px;
}

.detail-panel {
  background: #fff;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  padding: 16px;
  min-height: 60vh;
  box-shadow: var(--el-box-shadow-light);
  overflow: hidden;
}

.detail-head {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color);
  padding-bottom: 10px;

  .time {
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
}

.detail-text {
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.6;
}

.att {
  margin-top: 14px;
}

.att-title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-weight: 600;
}

.att-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.att-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
}

.att-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.att-icon {
  cursor: pointer;
}

.att-size {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.error {
  padding: 12px;
  color: #c45656;
  border: 1px solid #fbc4c4;
  background: #fef0f0;
  border-radius: 8px;
}

.skeleton-block {
  height: 140px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
</style>
