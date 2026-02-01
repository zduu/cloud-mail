<template>
  <div class="preview-email-manage">
    <div class="panel">
      <div class="header">
        <div class="title">
          <Icon icon="mingcute:mail-open-line" width="22" height="22"/>
          <span>{{ $t('previewEmailManage') }}</span>
        </div>
      </div>
      <div class="table-wrap">
        <el-table :data="data" v-loading="loading" height="520" style="width: 100%">
          <el-table-column prop="subject" :label="$t('subject')" min-width="200">
            <template #default="scope">
              <span>{{ scope.row.subject || $t('noSubject') }}</span>
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
              <el-popover placement="top" trigger="click" width="240" v-perm="'preview-email:expire'">
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
              <el-button type="danger" link @click="removeRow(scope.row)" v-perm="'preview-email:delete'">{{ $t('delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="card-list">
        <div class="card" v-for="item in data" :key="item.previewId">
          <div class="card-row">
            <span class="card-label">{{ $t('subject') }}</span>
            <span>{{ item.subject || $t('noSubject') }}</span>
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
            <el-popover placement="top" trigger="click" width="240" v-perm="'preview-email:expire'">
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
            <el-button type="danger" link @click="removeRow(item)" v-perm="'preview-email:delete'">{{ $t('delete') }}</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {onMounted, ref} from "vue";
import {previewEmailList, previewEmailDelete, previewEmailExpire} from "@/request/preview.js";
import {useI18n} from "vue-i18n";
import {Icon} from "@iconify/vue";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const {t} = useI18n();
const loading = ref(false);
const data = ref([]);

onMounted(() => {
  load();
});

async function load() {
  loading.value = true;
  try {
    data.value = await previewEmailList();
    data.value.forEach(row => row._days = null);
  } finally {
    loading.value = false;
  }
}

function previewLink(row) {
  return `${window.location.origin}/preview/email/${row.token}`;
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
    await previewEmailExpire(row.previewId, null);
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

  const res = await previewEmailExpire(row.previewId, days);
  row.expireTime = res.expireTime;
  ElMessage({
    message: t('saveSuccessMsg'),
    type: 'success',
    plain: true
  });
}

function removeRow(row) {
  ElMessageBox.confirm(t('delConfirm', {msg: row.subject || t('noSubject')}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    previewEmailDelete(row.previewId).then(() => {
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
.preview-email-manage {
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
  .preview-email-manage {
    padding: 10px;
  }

  .panel {
    padding: 12px;
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
