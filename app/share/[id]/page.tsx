"use client";

import { use, useEffect, useState } from "react";
import type { AccountStatus, ChatGptPlan, ReminderState, SubscriptionInput, SubscriptionView, SharedLink } from "@/lib/types";

type FormValues = SubscriptionInput;

const serviceTypeNames: Record<string, string> = { chatgpt: "ChatGPT", apple: "Apple", anzhuo: "安卓", other: "其他" };
const planNames: Record<ChatGptPlan, string> = { plus: "Plus", pro10: "Pro 10", pro20: "Pro 20", pro500: "Pro 500" };

const stateText: Record<ReminderState, string> = {
  cancelled: "已取消订阅",
  disabled: "已关闭提醒",
  scheduled: "待发送",
  due: "今日应发",
  sent: "已发送",
  expired: "已到期",
};

function sortRows(items: SubscriptionView[]): SubscriptionView[] {
  return [...items].sort((first, second) => {
    const priority = Number(second.expiryState === "imminent") - Number(first.expiryState === "imminent");
    return priority || first.expiresOn.localeCompare(second.expiresOn) || first.accountEmail.localeCompare(second.accountEmail);
  });
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

export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: shareId } = use(params);

  const [link, setLink] = useState<SharedLink | null>(null);
  const [rows, setRows] = useState<SubscriptionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 编辑表单状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/share/${shareId}`);
        if (!response.ok) {
          throw new Error(await readApiError(response));
        }
        const data = (await response.json()) as { link: SharedLink; subscriptions: SubscriptionView[] };
        setLink(data.link);
        setRows(sortRows(data.subscriptions));
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载分享数据失败。");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [shareId]);

  function startEdit(subscription: SubscriptionView) {
    setEditingId(subscription.id);
    setForm(inputFrom(subscription));
    setNotice(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
  }

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  function changeServiceType(serviceType: string) {
    setForm((current) => current ? {
      ...current,
      serviceType,
      chatGptPlan: serviceType === "chatgpt" ? current.chatGptPlan : undefined,
    } : current);
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !editingId) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/share/${shareId}/subscriptions/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const updated = (await response.json()) as SubscriptionView;
      setRows((current) => sortRows(current.map((item) => (item.id === updated.id ? updated : item))));
      setNotice(`账号 ${updated.accountEmail} 已成功更新。`);
      setEditingId(null);
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存修改失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(subscription: SubscriptionView) {
    if (!window.confirm(`确定从分享列表中删除账号 ${subscription.accountEmail} 吗？`)) {
      return;
    }

    setDeletingId(subscription.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/share/${shareId}/subscriptions/${subscription.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setRows((current) => current.filter((item) => item.id !== subscription.id));
      setNotice(`账号 ${subscription.accountEmail} 已删除。`);
      if (editingId === subscription.id) {
        cancelEdit();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    } finally {
      setDeletingId(null);
    }
  }

  const hasOperations = link && (link.allowEdit || link.allowDelete);

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">EXPIRY REMINDER · SHARED VIEW</p>
          <h1>{link?.title || "分享的账号到期列表"}</h1>
          <p className="intro">
            通过安全链接分享的账号列表
            {link && (
              <>
                {" · "}
                权限：
                <strong>
                  {[
                    link.allowEdit ? "允许更改" : null,
                    link.allowDelete ? "允许删除" : null,
                  ].filter(Boolean).join("、") || "只读查看"}
                </strong>
              </>
            )}
          </p>
        </div>
        <div className="summary">
          <span>共分享账号</span>
          <strong>{rows.length}</strong>
        </div>
      </header>

      {(notice || error) && <p className={`alert ${error ? "error" : "success"}`}>{error || notice}</p>}

      {/* 编辑弹窗/面板（若允许修改且正在编辑某条记录） */}
      {link?.allowEdit && editingId && form && (
        <section className="panel" aria-label="修改账号">
          <div className="section-heading">
            <div>
              <h2>修改账号信息</h2>
              <p>您拥有此分享链接的修改权限，编辑后会即时同步保存。</p>
            </div>
            <button className="button ghost" type="button" onClick={cancelEdit}>
              取消修改
            </button>
          </div>

          <form onSubmit={submitEdit} className="form-grid">
            <label>美区账号邮箱<input required type="email" value={form.ownerEmail} onChange={(event) => change("ownerEmail", event.target.value)} /></label>
            <label>账号邮箱<input required type="email" value={form.accountEmail} onChange={(event) => change("accountEmail", event.target.value)} /></label>
            <label>接收邮箱（可多个）<input required type="text" value={form.notificationEmail} onChange={(event) => change("notificationEmail", event.target.value)} /></label>
            <label>类型<select required value={form.serviceType} onChange={(event) => changeServiceType(event.target.value)}><option value="chatgpt">ChatGPT</option><option value="apple">Apple</option><option value="anzhuo">安卓</option><option value="other">其他</option></select></label>
            {form.serviceType === "chatgpt" && (
              <label>ChatGPT 套餐<select required value={form.chatGptPlan || ""} onChange={(event) => change("chatGptPlan", event.target.value as ChatGptPlan)}><option value="plus">Plus</option><option value="pro10">Pro 10</option><option value="pro20">Pro 20</option><option value="pro500">Pro 500</option></select></label>
            )}
            <label>开通时间<input required type="date" value={form.activatedOn} onChange={(event) => change("activatedOn", event.target.value)} /></label>
            <label>到期时间<input required type="date" value={form.expiresOn} onChange={(event) => change("expiresOn", event.target.value)} /></label>
            <label>状态<select value={form.status} onChange={(event) => change("status", event.target.value as AccountStatus)}><option value="active">已续费 / 正常</option><option value="paused">暂停</option><option value="expired">已到期</option></select></label>
            <label>默认提前提醒<select value={form.reminderDays} onChange={(event) => change("reminderDays", Number(event.target.value))}><option value={0}>到期当天</option><option value={1}>提前 1 天</option><option value={3}>提前 3 天</option><option value={7}>提前 7 天</option><option value={14}>提前 14 天</option><option value={30}>提前 30 天</option></select></label>
            <label>订阅状态<select value={form.cancelled ? "cancelled" : "active"} onChange={(event) => change("cancelled", event.target.value === "cancelled")}><option value="active">正常订阅（发送提醒）</option><option value="cancelled">已取消订阅（不发送提醒）</option></select></label>
            <label className="wide">备注<textarea value={form.notes} onChange={(event) => change("notes", event.target.value)} rows={3} /></label>
            <div className="wide form-actions">
              <button className="button primary" disabled={saving}>
                {saving ? "保存中…" : "确认保存修改"}
              </button>
              <button className="button ghost" type="button" onClick={cancelEdit}>
                取消
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 账号列表表格 */}
      <section className="panel table-panel">
        <div className="section-heading">
          <div>
            <h2>已授权的账号列表</h2>
            <p>到期日 3 天内的记录会高亮显示并自动置顶。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>美区账号</th>
                <th>账号</th>
                <th>类型</th>
                <th>套餐</th>
                <th>到期时间</th>
                <th>到期状态</th>
                <th>接收邮箱</th>
                <th>提醒规则</th>
                <th>状态</th>
                {hasOperations && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={hasOperations ? 10 : 9} className="empty">加载中…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={hasOperations ? 10 : 9} className="empty">暂无分享的账号数据。</td></tr>
              )}
              {!loading && rows.map((subscription) => (
                <tr key={subscription.id} className={subscription.expiryState === "imminent" ? "imminent-row" : undefined}>
                  <td>{subscription.ownerEmail}</td>
                  <td>{subscription.accountEmail}</td>
                  <td>{serviceTypeNames[subscription.serviceType] || subscription.serviceType}</td>
                  <td>{subscription.chatGptPlan ? planNames[subscription.chatGptPlan] : <span className="expiry-normal">—</span>}</td>
                  <td>{subscription.expiresOn}</td>
                  <td>{subscription.expiryState === "imminent" ? <span className="badge imminent">⚠ 马上到期</span> : <span className="expiry-normal">—</span>}</td>
                  <td className="recipient-list">{subscription.notificationEmail.split(/,\s*/).map((email) => <span key={email}>{email}</span>)}</td>
                  <td><span>{subscription.reminderRule.enabled ? `提前 ${subscription.reminderRule.daysBefore} 天` : "不发送"}</span></td>
                  <td><span className={`badge ${subscription.reminderState}`}>{stateText[subscription.reminderState]}</span></td>
                  {hasOperations && (
                    <td>
                      <div className="row-actions">
                        {link?.allowEdit && (
                          <button className="text-button" type="button" onClick={() => startEdit(subscription)}>
                            编辑
                          </button>
                        )}
                        {link?.allowDelete && (
                          <button
                            className="text-button danger"
                            type="button"
                            disabled={deletingId === subscription.id}
                            onClick={() => void handleDelete(subscription)}
                          >
                            {deletingId === subscription.id ? "删除中…" : "删除"}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>此页面由账号到期提醒系统自动生成。仅展示您被授予查看或操作权限的账号。</footer>
    </main>
  );
}

