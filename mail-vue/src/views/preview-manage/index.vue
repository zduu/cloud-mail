<template>
  <div class="preview-manage">
    <div class="panel">
      <div class="header">
        <div class="title">
          <Icon icon="mingcute:link-line" width="22" height="22"/>
          <span>{{ $t('previewMailbox') }}</span>
        </div>
        <div class="create">
          <el-input v-model="form.prefix" class="preview-prefix" :placeholder="$t('senderPrefixPlaceholder')">
            <template #append>
              <el-select v-model="form.domain" class="preview-domain" :placeholder="$t('senderDomainPlaceholder')">
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
            </template>
          </el-input>
          <el-button type="primary" :loading="creating" @click="create" v-perm="'preview:mailbox:create'">
            <Icon icon="material-symbols:add-rounded" width="16" height="16"/>
            <span style="margin-left: 4px">{{ $t('add') }}</span>
          </el-button>
        </div>
      </div>
      <div class="table-wrap">
        <el-table :data="data" v-loading="loading" height="520" style="width: 100%">
          <el-table-column prop="email" :label="$t('emailAccount')" min-width="160">
            <template #default="scope">
              <a :href="previewLink(scope.row)" target="_blank" class="email-link">{{ scope.row.email }}</a>
            </template>
          </el-table-column>
          <el-table-column :label="$t('previewLink')" min-width="220">
            <template #default="scope">
              <div class="preview-link">{{ previewLink(scope.row) }}</div>
            </template>
          </el-table-column>
          <el-table-column :label="$t('expireTime')" min-width="200">
            <template #default="scope">
              <div v-if="scope.row.expireTime">
                <div class="expire-status">{{ expireDesc(scope.row) }}</div>
                <div class="expire-time">{{ localExpireTime(scope.row) }}</div>
              </div>
              <div v-else>{{ $t('permanent') }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="createTime" :label="$t('createTime')" min-width="140"/>
          <el-table-column :label="$t('action')" width="260">
            <template #default="scope">
              <el-button type="primary" link @click="copy(scope.row)">{{ $t('copyLink') }}</el-button>
              <el-popover placement="top" trigger="click" width="240" v-perm="'preview:mailbox:expire'">
                <template #reference>
                  <el-button type="primary" link>{{ $t('expireTime') }}</el-button>
                </template>
                <div class="expire-pop">
                  <el-input-number v-model="scope.row._days" :min="1" :step="1" :placeholder="$t('days')" />
                  <div class="expire-btns">
                    <el-button size="small" @click="setExpire(scope.row)">{{ $t('save') }}</el-button>
                    <el-button size="small" type="warning" @click="setExpire(scope.row, true)">{{ $t('permanent') }}</el-button>
                  </div>
                  <div class="expire-tip" v-if="scope.row.expireTime">
                    {{ $t('currentExpire') }}: {{ localExpireTime(scope.row) }}
                  </div>
                </div>
              </el-popover>
              <el-button type="danger" link @click="removeRow(scope.row)" v-perm="'preview:mailbox:delete'">{{ $t('delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="card-list">
        <div class="card" v-for="item in data" :key="item.previewId">
          <div class="card-row">
            <span class="card-label">{{ $t('emailAccount') }}</span>
            <a :href="previewLink(item)" target="_blank" class="email-link">{{ item.email }}</a>
          </div>
          <div class="card-row">
            <span class="card-label">{{ $t('previewLink') }}</span>
            <div class="card-link">{{ previewLink(item) }}</div>
          </div>
          <div class="card-row">
            <span class="card-label">{{ $t('expireTime') }}</span>
            <div>
              <div class="expire-status" v-if="item.expireTime">{{ expireDesc(item) }}</div>
              <div class="expire-time" v-if="item.expireTime">{{ localExpireTime(item) }}</div>
              <div v-else>{{ $t('permanent') }}</div>
            </div>
          </div>
          <div class="card-row">
            <span class="card-label">{{ $t('createTime') }}</span>
            <span>{{ item.createTime }}</span>
          </div>
          <div class="card-actions">
            <el-button type="primary" link @click="copy(item)">{{ $t('copyLink') }}</el-button>
            <el-popover placement="top" trigger="click" width="240" v-perm="'preview:mailbox:expire'">
              <template #reference>
                <el-button type="primary" link>{{ $t('expireTime') }}</el-button>
              </template>
              <div class="expire-pop">
                <el-input-number v-model="item._days" :min="1" :step="1" :placeholder="$t('days')" />
                <div class="expire-btns">
                  <el-button size="small" @click="setExpire(item)">{{ $t('save') }}</el-button>
                  <el-button size="small" type="warning" @click="setExpire(item, true)">{{ $t('permanent') }}</el-button>
                </div>
                <div class="expire-tip" v-if="item.expireTime">
                  {{ $t('currentExpire') }}: {{ localExpireTime(item) }}
                </div>
              </div>
            </el-popover>
            <el-button type="danger" link @click="removeRow(item)" v-perm="'preview:mailbox:delete'">{{ $t('delete') }}</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {onMounted, reactive, ref, computed, watch} from "vue";
import {previewList, previewCreate, previewDelete, previewExpire} from "@/request/preview.js";
import {useSettingStore} from "@/store/setting.js";
import {useI18n} from "vue-i18n";
import {Icon} from "@iconify/vue";
import {isEmail} from "@/utils/verify-utils.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const settingStore = useSettingStore();
const {t} = useI18n();

const loading = ref(false);
const creating = ref(false);
const data = ref([]);
const form = reactive({
  prefix: '',
  domain: ''
});

const domainList = computed(() => settingStore.domainList?.length ? settingStore.domainList : (settingStore.settings.domainList || []));

onMounted(() => {
  if (!form.domain) {
    form.domain = domainList.value[0] || '';
  }
  load();
});

watch(domainList, (list) => {
  if (!form.domain && list.length) {
    form.domain = list[0];
  }
});

async function load() {
  loading.value = true;
  try {
    data.value = await previewList();
    data.value.forEach(row => row._days = null);
  } finally {
    loading.value = false;
  }
}

async function create() {
  if (creating.value) return;
  if (!domainList.value.length) {
    ElMessage({
      message: t('notExistDomain'),
      type: 'error',
      plain: true
    });
    return;
  }
  const prefix = form.prefix.trim();
  const domain = form.domain || domainList.value[0];
  const email = `${prefix}${domain}`.trim();

  if (!prefix || !domain) {
    ElMessage({
      message: t('senderSelectPlaceholder'),
      type: 'error',
      plain: true
    });
    return;
  }

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true
    });
    return;
  }

  creating.value = true;
  previewCreate(email, null).then(row => {
    row._days = null;
    data.value.unshift(row);
    form.prefix = '';
    ElMessage({
      message: t('addSuccessMsg'),
      type: 'success',
      plain: true
    });
  }).finally(() => {
    creating.value = false;
  });
}

function previewLink(row) {
  return `${window.location.origin}/preview/mail/${row.token}`;
}

async function copy(row) {
  try {
    await navigator.clipboard.writeText(previewLink(row));
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    });
  } catch (e) {
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    });
  }
}

async function setExpire(row, setPermanent = false) {
  if (setPermanent) {
    await previewExpire(row.previewId, null);
    row.expireTime = null;
    row._days = null;
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true
    });
    return;
  }

  const days = Number(row._days);
  if (!days || days <= 0) {
    ElMessage({
      message: t('previewExpireInvalid'),
      type: 'error',
      plain: true
    });
    return;
  }

  const res = await previewExpire(row.previewId, days);
  row.expireTime = res.expireTime;
  ElMessage({
    message: t('saveSuccessMsg'),
    type: 'success',
    plain: true
  });
}

function removeRow(row) {
  ElMessageBox.confirm(t('delConfirm', {msg: row.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    previewDelete(row.previewId).then(() => {
      data.value = data.value.filter(item => item.previewId !== row.previewId);
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      });
    });
  });
}

function expireDesc(row) {
  if (!row.expireTime) return t('permanent');
  const diff = dayjs.utc(row.expireTime).diff(dayjs.utc(), 'day', true);
  if (diff <= 0) return t('expired');
  return t('expireInDays', { days: Math.ceil(diff) });
}

function localExpireTime(row) {
  if (!row.expireTime) return '';
  return dayjs.utc(row.expireTime).local().format('YYYY-MM-DD HH:mm:ss');
}
</script>

<style scoped lang="scss">
.preview-manage {
  padding: 14px;
}

.panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  padding: 14px;
  box-shadow: var(--el-box-shadow-light);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 16px;
}

.create {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.preview-prefix {
  width: 320px;
}

.preview-domain {
  width: 160px;
}

.preview-link {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expire-pop {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.expire-btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.expire-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.expire-status {
  font-weight: 600;
}

.expire-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.email-link {
  color: var(--el-color-primary);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.email-link:hover {
  color: var(--el-color-primary-light-3);
  text-decoration: underline;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
}

.card-list {
  display: none;
  flex-direction: column;
  gap: 10px;
}

.card {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  padding: 12px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-lighter);
}

.card-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
  align-items: center;
}

.card-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.card-link {
  word-break: break-all;
  white-space: normal;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

@media (max-width: 1200px) {
  .preview-manage {
    padding: 10px;
  }

  .panel {
    padding: 12px;
  }

  .create {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .preview-prefix,
  .preview-domain,
  .create el-button {
    width: 100%;
  }

  .header {
    align-items: stretch;
    flex-direction: column;
  }

  .card-row {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* 随窗口宽度流式压缩表格；小屏使用卡片视图 */
@media (max-width: 1400px) {
  .table-wrap {
    display: none;
  }

  .card-list {
    display: flex;
  }
}

@media (min-width: 1401px) {
  .table-wrap {
    display: block;
  }

  .card-list {
    display: none;
  }
}
</style>
