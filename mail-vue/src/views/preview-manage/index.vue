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
          <el-button type="primary" :loading="creating" @click="create">
            <Icon icon="material-symbols:add-rounded" width="16" height="16"/>
            <span style="margin-left: 4px">{{ $t('add') }}</span>
          </el-button>
        </div>
      </div>
      <el-table :data="data" v-loading="loading" height="520" style="width: 100%">
        <el-table-column prop="email" :label="$t('emailAccount')" min-width="160"/>
        <el-table-column :label="$t('previewLink')" min-width="220">
          <template #default="scope">
            <div class="preview-link">{{ previewLink(scope.row) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" :label="$t('createTime')" min-width="140"/>
        <el-table-column :label="$t('action')" width="180">
          <template #default="scope">
            <el-button type="primary" link @click="copy(scope.row)">{{ $t('copyLink') }}</el-button>
            <el-button type="danger" link @click="removeRow(scope.row)">{{ $t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import {onMounted, reactive, ref, computed, watch} from "vue";
import {previewList, previewCreate, previewDelete} from "@/request/preview.js";
import {useSettingStore} from "@/store/setting.js";
import {useI18n} from "vue-i18n";
import {Icon} from "@iconify/vue";
import {isEmail} from "@/utils/verify-utils.js";

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
  previewCreate(email).then(row => {
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
</style>
