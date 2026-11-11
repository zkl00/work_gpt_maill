"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SHAREABLE_COLUMNS } from "@/lib/types";
import type { AccountStatus, ChatGptPlan, ReminderState, SharedLink, SubscriptionInput, SubscriptionView } from "@/lib/types";

type FormValues = SubscriptionInput;

type EmailConfigStatus = {
  configured: boolean;
  from: string | null;
  provider: "resend" | null;
  storageReady: boolean;
};

type ImportPreview = {
  rows: SubscriptionInput[];
  errors: Array<{ line: number; message: string }>;
};

const serviceTypeNames: Record<string, string> = { chatgpt: "ChatGPT", apple: "Apple", anzhuo: "安卓", other: "其他" };
const planNames: Record<ChatGptPlan, string> = { plus: "Plus", pro10: "Pro 10", pro20: "Pro 20", pro500: "Pro 500" };

function displayService(subscription: SubscriptionView): string {
  const type = serviceTypeNames[subscription.serviceType] || subscription.serviceType;
  return subscription.serviceType === "chatgpt" && subscription.chatGptPlan
    ? `${type} · ${planNames[subscription.chatGptPlan]}`
    : type;
}

const stateText: Record<ReminderState, string> = {
  cancelled: "已取消订阅",
  disabled: "已关闭提醒",
  scheduled: "待发送",
  due: "今日应发",
  sent: "已发送",
  expired: "已到期",
};

function sortRowsForAttention(items: SubscriptionView[]): SubscriptionView[] {
  return [...items].sort((first, second) => {
    const priority = Number(second.expiryState === "imminent") - Number(first.expiryState === "imminent");
    return priority || first.expiresOn.localeCompare(second.expiresOn) || first.accountEmail.localeCompare(second.accountEmail);
  });
}

const today = new Date().toISOString().slice(0, 10);

function initialForm(): FormValues {
  return {
    ownerEmail: "",
    accountEmail: "",
    serviceType: "",
    chatGptPlan: undefined,
    activatedOn: today,
    expiresOn: today,
    status: "active",
    cancelled: false,
    notes: "",
    notificationEmail: "",
    reminderDays: 3,
  };
}

function inputFrom(subscription: SubscriptionView): FormValues {
  return {
    ownerEmail: subscription.ownerEmail,
    accountEmail: subscription.accountEmail,
    serviceType: subscription.serviceType,
    chatGptPlan: subscription.chatGptPlan,
    activatedOn: subscription.activatedOn,
    expiresOn: subscription.expiresOn,
    status: subscription.status,
    cancelled: subscription.cancelled,
    notes: subscription.notes,
    notificationEmail: subscription.notificationEmail,
    reminderDays: subscription.reminderRule.daysBefore,
  };
}

async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "请求失败，请稍后重试。";
}

export default function Home() {
  const [rows, setRows] = useState<SubscriptionView[]>([]);
  const [form, setForm] = useState<FormValues>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported">("default");
  const notifiedReminderKeys = useRef(new Set<string>());
  const importFileInput = useRef<HTMLInputElement>(null);
  const [emailConfig, setEmailConfig] = useState<EmailConfigStatus>({
    configured: false,
    from: null,
    provider: null,
    storageReady: false,
  });
  const [emailApiKey, setEmailApiKey] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [previewingImport, setPreviewingImport] = useState(false);
  const [committingImport, setCommittingImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 分享功能状态
  const defaultVisibleColumns = ["accountEmail", "serviceType", "chatGptPlan", "expiresOn", "expiryState", "status"];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [manageSharesOpen, setManageSharesOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareAllowEdit, setShareAllowEdit] = useState(false);
  const [shareAllowDelete, setShareAllowDelete] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(defaultVisibleColumns);
  const [createdShareUrl, setCreatedShareUrl] = useState<string | null>(null);
  const [generatingShare, setGeneratingShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // 身份认证状态
  const [authStatus, setAuthStatus] = useState<{ initialized: boolean; authenticated: boolean } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const dueCount = useMemo(
    () => rows.filter((item) => item.reminderState === "due").length,
    [rows],
  );

  async function loadRows() {
    setLoading(true);
    try {
      const response = await fetch("/api/subscriptions", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response));
      setRows(sortRowsForAttention((await response.json()) as SubscriptionView[]));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败。" );
    } finally {
      setLoading(false);
    }
  }

  async function loadEmailConfig() {
    try {
      const response = await fetch("/api/email-settings", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response));
      const config = (await response.json()) as EmailConfigStatus;
      setEmailConfig(config);
      setEmailFrom(config.from || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "邮件配置加载失败。" );
    }
  }

  async function loadSharedLinks() {
    try {
      const response = await fetch("/api/share", { cache: "no-store" });
      if (response.ok) {
        setSharedLinks((await response.json()) as SharedLink[]);
      }
    } catch {
      // 忽略分享列表加载异常
    }
  }

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((item) => item.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openShareModal() {
    if (selectedIds.size === 0) {
      setError("请先在账号列表中勾选要分享的账号。");
      return;
    }
    setError(null);
    setCreatedShareUrl(null);
    setShareTitle("");
    setShareAllowEdit(false);
    setShareAllowDelete(false);
    setSelectedColumns(defaultVisibleColumns);
    setShareModalOpen(true);
  }

  async function handleCreateShare() {
    if (selectedIds.size === 0) return;
    if (selectedColumns.length === 0) {
      setError("请至少勾选一个对外展示的表头列。");
      return;
    }
    setGeneratingShare(true);
    setError(null);
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionIds: Array.from(selectedIds),
          allowEdit: shareAllowEdit,
          allowDelete: shareAllowDelete,
          visibleColumns: selectedColumns,
          title: shareTitle,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const created = (await response.json()) as SharedLink;
      setSharedLinks((current) => [created, ...current]);
      const fullUrl = `${window.location.origin}/share/${created.id}`;
      setCreatedShareUrl(fullUrl);
      setNotice("分享链接已成功生成！");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成分享链接失败。");
    } finally {
      setGeneratingShare(false);
    }
  }

  async function handleDeleteShare(id: string) {
    if (!window.confirm("确定撤销/删除该分享链接吗？撤销后被分享人将无法再访问。")) return;
    try {
      const response = await fetch(`/api/share/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response));
      setSharedLinks((current) => current.filter((item) => item.id !== id));
      setNotice("已成功撤销该分享链接。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function checkAuth() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      if (!res.ok) throw new Error("获取登录状态失败。");
      const data = (await res.json()) as { initialized: boolean; authenticated: boolean };
      setAuthStatus(data);
      if (data.authenticated) {
        void loadRows();
        void loadEmailConfig();
        void loadSharedLinks();
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "网络异常。");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", password: authPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "登录失败。");
      setAuthStatus({ initialized: true, authenticated: true });
      setAuthPassword("");
      void loadRows();
      void loadEmailConfig();
      void loadSharedLinks();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "登录失败。");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (authPassword.length < 6) {
      setAuthError("密码长度不能少于 6 位。");
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError("两次输入的密码不一致。");
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", password: authPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "设置失败。");
      setAuthStatus({ initialized: true, authenticated: true });
      setAuthPassword("");
      setAuthConfirmPassword("");
      setNotice("管理员密码设置成功！已自动进入管理后台。");
      void loadRows();
      void loadEmailConfig();
      void loadSharedLinks();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "设置失败。");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    if (!window.confirm("确定退出管理后台吗？")) return;
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setAuthStatus({ initialized: true, authenticated: false });
      setRows([]);
    } catch {
      window.location.reload();
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangingPassword(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", oldPassword, newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "修改失败。");
      setNotice("密码修改成功！");
      setChangePasswordModalOpen(false);
      setOldPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败。");
    } finally {
      setChangingPassword(false);
    }
  }

  useEffect(() => {
    void checkAuth();
    if (!("Notification" in window)) {
      setDesktopPermission("unsupported");
      return;
    }
    setDesktopPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (desktopPermission !== "granted") return;

    for (const subscription of rows.filter((item) => item.reminderState === "due")) {
      const key = `${subscription.id}:${subscription.expiresOn}`;
      if (notifiedReminderKeys.current.has(key) || localStorage.getItem(`expiry-notified:${key}`)) continue;

      new Notification("账号到期提醒", {
        body: `${subscription.serviceType}：${subscription.accountEmail} 将在 ${subscription.expiresOn} 到期。`,
        tag: key,
      });
      notifiedReminderKeys.current.add(key);
      localStorage.setItem(`expiry-notified:${key}`, new Date().toISOString());
    }
  }, [desktopPermission, rows]);

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeServiceType(serviceType: string) {
    setForm((current) => ({
      ...current,
      serviceType,
      chatGptPlan: serviceType === "chatgpt" ? current.chatGptPlan : undefined,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint = editingId ? `/api/subscriptions/${editingId}` : "/api/subscriptions";
      const response = await fetch(endpoint, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const saved = (await response.json()) as SubscriptionView;
      setRows((current) => {
        const retained = current.filter((item) => item.id !== saved.id);
        return sortRowsForAttention([...retained, saved]);
      });
      setNotice(editingId ? "账号已更新，提醒日期已重新计算。" : "账号已保存，系统会按到期日自动处理。" );
      setEditingId(null);
      setForm(initialForm());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败。" );
    } finally {
      setSubmitting(false);
    }
  }

  async function sendNow(subscription: SubscriptionView) {
    setSendingId(subscription.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/subscriptions/${subscription.id}/send`, { method: "POST" });
      if (!response.ok) throw new Error(await readApiError(response));
      const result = (await response.json()) as { message: string };
      setNotice(result.message);
      await loadRows();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "发送失败。" );
    } finally {
      setSendingId(null);
    }
  }

  async function restoreReminder(subscription: SubscriptionView) {
    if (subscription.serviceType === "chatgpt" && !subscription.chatGptPlan) {
      edit(subscription);
      setError("这条旧 ChatGPT 记录还没有套餐，请先选择 Plus、Pro 10、Pro 20 或 Pro 500 后保存。");
      return;
    }
    setRestoringId(subscription.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inputFrom(subscription), cancelled: false }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const restored = (await response.json()) as SubscriptionView;
      setRows((current) => sortRowsForAttention(current.map((item) => item.id === restored.id ? restored : item)));
      setNotice("已恢复正常订阅，现在可以发送测试邮件。 ");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "恢复提醒失败。" );
    } finally {
      setRestoringId(null);
    }
  }

  async function deleteSubscription(subscription: SubscriptionView) {
    const confirmed = window.confirm(`确定删除 ${displayService(subscription)} 账号 ${subscription.accountEmail} 吗？此操作不能撤销。`);
    if (!confirmed) return;

    setDeletingId(subscription.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/subscriptions/${subscription.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response));
      setRows((current) => current.filter((item) => item.id !== subscription.id));
      if (editingId === subscription.id) {
        setEditingId(null);
        setForm(initialForm());
      }
      setNotice("账号记录已删除。 ");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败。" );
    } finally {
      setDeletingId(null);
    }
  }

  async function previewImport(file: File) {
    setPreviewingImport(true);
    setError(null);
    setNotice(null);
    setImportPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/subscriptions/import", { method: "POST", body: formData });
      if (!response.ok) throw new Error(await readApiError(response));
      const preview = (await response.json()) as ImportPreview;
      setImportPreview(preview);
      setImportFileName(file.name);
      if (preview.rows.length) {
        setNotice(`已读取 ${preview.rows.length} 条可导入记录，请确认后再写入。`);
      } else {
        setError("没有可导入的记录，请检查表头和错误提示。 ");
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "读取导入文件失败。" );
    } finally {
      setPreviewingImport(false);
      if (importFileInput.current) importFileInput.current.value = "";
    }
  }

  async function confirmImport() {
    if (!importPreview?.rows.length) return;
    setCommittingImport(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/subscriptions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importPreview.rows }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result = (await response.json()) as { imported: number };
      setImportPreview(null);
      setImportFileName(null);
      setNotice(`已成功导入 ${result.imported} 条账号记录。`);
      await loadRows();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败。" );
    } finally {
      setCommittingImport(false);
    }
  }

  async function exportSubscriptions() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/export");
      if (!response.ok) throw new Error(await readApiError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "账号到期提醒.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败。" );
    } finally {
      setExporting(false);
    }
  }

  function edit(subscription: SubscriptionView) {
    setEditingId(subscription.id);
    setForm(inputFrom(subscription));
    setError(null);
    setNotice(null);
    document.getElementById("subscription-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function enableDesktopNotifications() {
    if (!("Notification" in window)) {
      setDesktopPermission("unsupported");
      setError("当前浏览器不支持电脑通知。");
      return;
    }
    const permission = await Notification.requestPermission();
    setDesktopPermission(permission);
    if (permission === "granted") {
      setNotice("电脑通知已开启；当前页面打开时会提示今日应发送的账号。");
      setError(null);
    } else {
      setError("没有获得通知权限。请在浏览器的网站设置中允许通知后重试。");
    }
  }

  async function saveEmailSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEmailConfig(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "resend", apiKey: emailApiKey, from: emailFrom }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const saved = (await response.json()) as EmailConfigStatus;
      setEmailConfig(saved);
      setEmailFrom(saved.from || "");
      setEmailApiKey("");
      setNotice("邮件发送配置已加密保存。现在可使用“立即测试”发送一封真实邮件。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "邮件配置保存失败。" );
    } finally {
      setSavingEmailConfig(false);
    }
  }

  const desktopButtonText = desktopPermission === "granted"
    ? "电脑提醒已开启"
    : desktopPermission === "unsupported"
      ? "浏览器不支持电脑提醒"
      : "开启电脑提醒";

  if (authLoading) {
    return (
      <main style={{ textAlign: "center", paddingTop: "120px" }}>
        <p style={{ color: "var(--muted)", fontSize: "15px" }}>正在验证管理员身份…</p>
      </main>
    );
  }

  if (authStatus && !authStatus.initialized) {
    return (
      <main>
        <div className="login-card">
          <h2>🔐 首次使用设置密码</h2>
          <p>系统目前尚未设置管理密码。请为您的账号到期总管理后台设置一个安全访问密码。</p>
          {authError && <p className="alert error" style={{ margin: "0 0 16px" }}>{authError}</p>}
          <form onSubmit={handleSetup} className="login-form">
            <label>
              设置管理员密码（至少 6 位）
              <input
                required
                type="password"
                placeholder="请输入管理密码"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </label>
            <label>
              确认管理员密码
              <input
                required
                type="password"
                placeholder="请再次输入管理密码"
                value={authConfirmPassword}
                onChange={(e) => setAuthConfirmPassword(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={authSubmitting} style={{ marginTop: "8px" }}>
              {authSubmitting ? "保存中…" : "设置密码并进入后台"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (authStatus && !authStatus.authenticated) {
    return (
      <main>
        <div className="login-card">
          <h2>🔐 管理后台登录</h2>
          <p>当前页面为总账号管理后台，请输入管理员访问密码后查看。</p>
          {authError && <p className="alert error" style={{ margin: "0 0 16px" }}>{authError}</p>}
          <form onSubmit={handleLogin} className="login-form">
            <label>
              管理员密码
              <input
                required
                autoFocus
                type="password"
                placeholder="请输入管理密码"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={authSubmitting} style={{ marginTop: "8px" }}>
              {authSubmitting ? "登录中…" : "进入管理后台"}
            </button>
          </form>
          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <small style={{ color: "var(--muted)" }}>若您是被分享人，请通过专属分享链接访问授权内容。</small>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">EXPIRY MAILER</p>
          <h1>账号到期提醒</h1>
          <p className="intro">记录账号、接收邮箱和到期日；系统在指定日期自动发送邮件。</p>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
          <div className="auth-header-actions" style={{ marginBottom: "6px" }}>
            <button className="button ghost" type="button" onClick={() => setChangePasswordModalOpen(true)}>
              修改密码
            </button>
            <button className="button ghost" type="button" onClick={() => void handleLogout()}>
              退出
            </button>
          </div>
          <div className="summary" aria-label="待处理统计">
            <span>今日待发送</span>
            <strong>{dueCount}</strong>
          </div>
        </div>
      </section>

      <section className="desktop-notification" aria-label="电脑提醒设置">
        <div>
          <strong>电脑提示</strong>
          <span>邮件会照常发送；开启后，这个网页打开时，今日应提醒的账号也会弹出系统通知。</span>
        </div>
        <button
          className="button ghost"
          type="button"
          disabled={desktopPermission === "granted" || desktopPermission === "unsupported"}
          onClick={() => void enableDesktopNotifications()}
        >
          {desktopButtonText}
        </button>
      </section>

      <section className="panel email-settings" aria-label="邮件发送设置">
        <div className="section-heading">
          <div>
            <h2>邮件发送设置</h2>
            <p>{emailConfig.configured ? `已配置 Resend 发件人：${emailConfig.from}` : "Cloudflare 版本使用 Resend API 发送邮件；QQ、163、Gmail 都可以作为接收邮箱。"}</p>
          </div>
          <span className={`badge ${emailConfig.configured ? "sent" : "disabled"}`}>{emailConfig.configured ? "已配置" : "未配置"}</span>
        </div>
        <form className="email-config-form" onSubmit={saveEmailSettings}>
          <label>Resend API Key<input required type="password" autoComplete="new-password" value={emailApiKey} onChange={(event) => setEmailApiKey(event.target.value)} placeholder="re_xxxxxxxxx" /></label>
          <label>发件人<input required value={emailFrom} onChange={(event) => setEmailFrom(event.target.value)} placeholder="到期提醒 <reminders@your-domain.com>" /></label>
          <div className="email-config-action"><button className="button primary" disabled={!emailConfig.storageReady || savingEmailConfig}>{savingEmailConfig ? "保存中…" : "加密保存邮件配置"}</button><span>{emailConfig.storageReady ? "密钥会在 D1 中加密保存，且不会回显或返回到浏览器。" : "请先设置 Cloudflare Secret：EMAIL_CONFIG_ENCRYPTION_KEY。"}</span></div>
        </form>
      </section>

      <section className="panel" id="subscription-form">
        <div className="section-heading">
          <div>
            <h2>{editingId ? "编辑账号" : "添加账号"}</h2>
            <p>“接收邮箱”是实际收提醒的人；支持多个邮箱，用逗号、分号或换行分隔。</p>
          </div>
          {editingId && (
            <button className="button ghost" type="button" onClick={() => { setEditingId(null); setForm(initialForm()); }}>
              取消编辑
            </button>
          )}
        </div>

        <form onSubmit={submit} className="form-grid">
          <label>美区账号邮箱<input required type="email" value={form.ownerEmail} onChange={(event) => change("ownerEmail", event.target.value)} placeholder="owner@example.com" /></label>
          <label>账号邮箱<input required type="email" value={form.accountEmail} onChange={(event) => change("accountEmail", event.target.value)} placeholder="account@example.com" /></label>
          <label>接收邮箱（可多个）<input required type="text" value={form.notificationEmail} onChange={(event) => change("notificationEmail", event.target.value)} placeholder="a@example.com, b@example.com" /></label>
          <label>类型<select required value={form.serviceType} onChange={(event) => changeServiceType(event.target.value)}><option value="" disabled>请选择类型</option><option value="chatgpt">ChatGPT</option><option value="apple">Apple</option><option value="anzhuo">安卓</option><option value="other">其他</option></select></label>
          {form.serviceType === "chatgpt" && <label>ChatGPT 套餐<select required value={form.chatGptPlan || ""} onChange={(event) => change("chatGptPlan", event.target.value as ChatGptPlan)}><option value="" disabled>请选择套餐</option><option value="plus">Plus</option><option value="pro10">Pro 10</option><option value="pro20">Pro 20</option><option value="pro500">Pro 500</option></select></label>}
          <label>开通时间<input required type="date" value={form.activatedOn} onChange={(event) => change("activatedOn", event.target.value)} /></label>
          <label>到期时间<input required type="date" value={form.expiresOn} onChange={(event) => change("expiresOn", event.target.value)} /></label>
          <label>状态<select value={form.status} onChange={(event) => change("status", event.target.value as AccountStatus)}><option value="active">已续费 / 正常</option><option value="paused">暂停</option><option value="expired">已到期</option></select></label>
          <label>默认提前提醒<select value={form.reminderDays} onChange={(event) => change("reminderDays", Number(event.target.value))}><option value={0}>到期当天</option><option value={1}>提前 1 天</option><option value={3}>提前 3 天</option><option value={7}>提前 7 天</option><option value={14}>提前 14 天</option><option value={30}>提前 30 天</option></select></label>
          <label>订阅状态<select value={form.cancelled ? "cancelled" : "active"} onChange={(event) => change("cancelled", event.target.value === "cancelled")}><option value="active">正常订阅（发送提醒）</option><option value="cancelled">已取消订阅（不发送提醒）</option></select></label>
          <label className="wide">备注（可写“提前 7 天提醒”“不用发邮件”等自然语言规则）<textarea value={form.notes} onChange={(event) => change("notes", event.target.value)} placeholder="例如：没有解绑卡；需要提前 3 天充值" rows={3} /></label>
          <div className="wide form-actions"><button className="button primary" disabled={submitting}>{submitting ? "保存中…" : editingId ? "保存修改" : "保存并开启提醒"}</button><span>备注会由 TypeSafe 解读；日期计算与发信权限始终按系统规则执行。</span></div>
        </form>
      </section>

      <section className="panel import-panel" aria-label="导入账号">
        <div className="section-heading">
          <div>
            <h2>导入账号</h2>
            <p>支持 .xlsx、.xls、.csv，先预览后确认导入。单次最多 500 条。</p>
          </div>
          <input ref={importFileInput} className="visually-hidden" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => { const file = event.target.files?.[0]; if (file) void previewImport(file); }} />
          <button className="button ghost" type="button" disabled={previewingImport || committingImport} onClick={() => importFileInput.current?.click()}>{previewingImport ? "读取中…" : "选择导入文件"}</button>
        </div>
        <p className="import-help">必填表头：美区账号、账号、类型、开通时间、到期时间。可选：套餐、接收邮箱、提前提醒天数、是否取消订阅、状态、备注。“接收邮箱”可填写多个邮箱（逗号、分号或换行分隔）；未填时会使用“美区账号”邮箱接收提醒。</p>
        {importPreview && <div className="import-preview"><div><strong>{importFileName}</strong><span> 可导入 {importPreview.rows.length} 条；跳过/错误 {importPreview.errors.length} 条。</span></div>{importPreview.errors.length > 0 && <ul>{importPreview.errors.map((item, index) => <li key={`${item.line}-${index}`}>第 {item.line} 行：{item.message}</li>)}</ul>}<div className="import-actions"><button className="button primary" type="button" disabled={!importPreview.rows.length || committingImport} onClick={() => void confirmImport()}>{committingImport ? "导入中…" : `确认导入 ${importPreview.rows.length} 条`}</button><button className="button ghost" type="button" disabled={committingImport} onClick={() => { setImportPreview(null); setImportFileName(null); }}>取消</button></div></div>}
      </section>

      {(notice || error) && <p className={`alert ${error ? "error" : "success"}`}>{error || notice}</p>}

      <section className="panel table-panel">
        <div className="section-heading">
          <div><h2>账号列表</h2><p>到期日 3 天内的未取消记录会标记为“马上到期”并自动置顶。</p></div>
          <div className="table-controls">
            <button className="button primary" type="button" onClick={openShareModal}>
              🔗 分享选中项{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </button>
            <button className="button ghost" type="button" onClick={() => setManageSharesOpen(true)}>
              管理分享{sharedLinks.length > 0 ? ` (${sharedLinks.length})` : ""}
            </button>
            <button className="button ghost" type="button" disabled={exporting} onClick={() => void exportSubscriptions()}>{exporting ? "导出中…" : "导出 Excel"}</button>
            <button className="button ghost" type="button" onClick={() => void loadRows()}>刷新</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    title="全选 / 取消全选"
                  />
                </th>
                <th>美区账号</th>
                <th>账号</th>
                <th>类型</th>
                <th>套餐</th>
                <th>到期时间</th>
                <th>到期状态</th>
                <th>接收邮箱</th>
                <th>提醒规则</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={11} className="empty">加载中…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={11} className="empty">还没有账号。填写上方表单后开始管理提醒。</td></tr>}
              {!loading && rows.map((subscription) => (
                <tr key={subscription.id} className={subscription.expiryState === "imminent" ? "imminent-row" : undefined}>
                  <td className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(subscription.id)}
                      onChange={() => toggleSelect(subscription.id)}
                      title={`勾选 ${subscription.accountEmail} 进行分享`}
                    />
                  </td>
                  <td>{subscription.ownerEmail}</td>
                  <td>{subscription.accountEmail}</td>
                  <td>{serviceTypeNames[subscription.serviceType] || subscription.serviceType}</td>
                  <td>{subscription.chatGptPlan ? planNames[subscription.chatGptPlan] : <span className="expiry-normal">—</span>}</td>
                  <td>{subscription.expiresOn}</td>
                  <td>{subscription.expiryState === "imminent" ? <span className="badge imminent">⚠ 马上到期</span> : <span className="expiry-normal">—</span>}</td>
                  <td className="recipient-list">{subscription.notificationEmail.split(/,\s*/).map((email) => <span key={email}>{email}</span>)}</td>
                  <td><span>{subscription.reminderRule.enabled ? `提前 ${subscription.reminderRule.daysBefore} 天` : "不发送"}</span><small>{subscription.reminderRule.source === "typesafe" ? "TypeSafe 已解读备注" : subscription.nextSendOn ? `发送日 ${subscription.nextSendOn}` : "—"}</small></td>
                  <td><span className={`badge ${subscription.reminderState}`}>{stateText[subscription.reminderState]}</span></td>
                  <td><div className="row-actions"><button className="text-button" type="button" onClick={() => edit(subscription)}>编辑</button>{subscription.cancelled ? <button className="text-button" type="button" disabled={restoringId === subscription.id} onClick={() => void restoreReminder(subscription)}>{restoringId === subscription.id ? "恢复中…" : "恢复提醒"}</button> : <button className="text-button" type="button" disabled={sendingId === subscription.id || !subscription.reminderRule.enabled} onClick={() => void sendNow(subscription)}>{sendingId === subscription.id ? "发送中…" : "立即测试"}</button>}<button className="text-button danger" type="button" disabled={deletingId === subscription.id} onClick={() => void deleteSubscription(subscription)}>{deletingId === subscription.id ? "删除中…" : "删除"}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 创建分享模态框 */}
      {shareModalOpen && (
        <div className="modal-overlay" onClick={() => setShareModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>生成专属分享链接</h3>
              <button className="text-button" type="button" onClick={() => setShareModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "13.5px" }}>
                已选择 <strong>{selectedIds.size}</strong> 个账号进行分享。被分享人只能访问这些勾选的账号。
              </p>

              <label style={{ display: "block" }}>
                分享说明 / 标题（选填）
                <input
                  type="text"
                  placeholder="例如：给团队小李查看的账号"
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                />
              </label>

              <div>
                <label style={{ display: "block", marginBottom: "8px" }}>分享人权限设置</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={shareAllowEdit}
                      onChange={(e) => setShareAllowEdit(e.target.checked)}
                    />
                    <span>允许修改账号信息（更改）</span>
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={shareAllowDelete}
                      onChange={(e) => setShareAllowDelete(e.target.checked)}
                    />
                    <span>允许删除账号（删除）</span>
                  </label>
                </div>
                <small style={{ display: "block", marginTop: "6px", color: "var(--muted)" }}>
                  未勾选时默认仅为只读查看权限，无法修改或删除数据。
                </small>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ margin: 0, fontWeight: 700 }}>对外展示的表头列（未勾选的列将彻底隐藏）</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: "12px" }}
                      onClick={() => setSelectedColumns(SHAREABLE_COLUMNS.map((c) => c.key))}
                    >
                      全部显示
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: "12px" }}
                      onClick={() => setSelectedColumns(defaultVisibleColumns)}
                    >
                      恢复默认
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid var(--line)" }}>
                  {SHAREABLE_COLUMNS.map((col) => (
                    <label key={col.key} className="checkbox-inline" style={{ fontSize: "13px" }}>
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(col.key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedColumns((prev) => [...prev, col.key]);
                          } else {
                            setSelectedColumns((prev) => prev.filter((k) => k !== col.key));
                          }
                        }}
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
                <small style={{ display: "block", marginTop: "6px", color: "var(--muted)" }}>
                  默认已隐藏“美区账号”、“接收邮箱”、“提醒规则”等内部字段。
                </small>
              </div>

              {createdShareUrl && (
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid var(--line)" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>✓ 分享链接已生成：</span>
                  <div className="share-link-box">
                    <input readOnly value={createdShareUrl} />
                    <button className="button primary" type="button" onClick={() => void copyText(createdShareUrl)}>
                      {copied ? "已复制" : "复制"}
                    </button>
                  </div>
                  <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
                    <a href={createdShareUrl} target="_blank" rel="noreferrer" className="text-button" style={{ fontSize: "13px" }}>
                      在新标签页中打开预览 ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {!createdShareUrl ? (
                <>
                  <button className="button ghost" type="button" onClick={() => setShareModalOpen(false)}>取消</button>
                  <button className="button primary" type="button" disabled={generatingShare} onClick={() => void handleCreateShare()}>
                    {generatingShare ? "生成中…" : "立即生成分享链接"}
                  </button>
                </>
              ) : (
                <button className="button primary" type="button" onClick={() => setShareModalOpen(false)}>完成</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 管理分享模态框 */}
      {manageSharesOpen && (
        <div className="modal-overlay" onClick={() => setManageSharesOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>管理已生成的分享链接</h3>
              <button className="text-button" type="button" onClick={() => setManageSharesOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {sharedLinks.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--muted)", padding: "20px 0" }}>暂无活跃的分享链接。</p>
              ) : (
                sharedLinks.map((link) => {
                  const url = typeof window !== "undefined" ? `${window.location.origin}/share/${link.id}` : `/share/${link.id}`;
                  const perms = [
                    link.allowEdit ? "允许更改" : null,
                    link.allowDelete ? "允许删除" : null,
                  ].filter(Boolean).join("、") || "只读查看";

                  return (
                    <div key={link.id} className="share-list-item">
                      <div className="share-list-info">
                        <strong>{link.title || `分享 (${link.subscriptionIds.length} 个账号)`}</strong>
                        <span className="share-list-meta">
                          权限：{perms} · 展示 {link.visibleColumns?.length ?? 6} 列 · 账号数：{link.subscriptionIds.length} · {link.createdAt.slice(0, 10)}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button className="text-button" type="button" onClick={() => void copyText(url)}>
                          复制链接
                        </button>
                        <a href={url} target="_blank" rel="noreferrer" className="text-button">
                          预览
                        </a>
                        <button className="text-button danger" type="button" onClick={() => void handleDeleteShare(link.id)}>
                          撤销
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setManageSharesOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 修改密码模态框 */}
      {changePasswordModalOpen && (
        <div className="modal-overlay" onClick={() => setChangePasswordModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>修改管理员密码</h3>
              <button className="text-button" type="button" onClick={() => setChangePasswordModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                <label>
                  当前密码
                  <input
                    required
                    type="password"
                    placeholder="请输入当前密码"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                </label>
                <label>
                  新密码（至少 6 位）
                  <input
                    required
                    type="password"
                    placeholder="请输入新密码"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button className="button ghost" type="button" onClick={() => setChangePasswordModalOpen(false)}>
                  取消
                </button>
                <button className="button primary" disabled={changingPassword}>
                  {changingPassword ? "修改中…" : "确认修改"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer>Cloudflare Cron 每天 09:00（Asia/Shanghai）检查一次。页面保存 Resend 配置前，请在 Cloudflare 设置 <code>EMAIL_CONFIG_ENCRYPTION_KEY</code>。</footer>
    </main>
  );
}
