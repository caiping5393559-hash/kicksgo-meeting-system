# Kicksgo 周会管理系统

用于 Kicksgo 美国项目每周在线会议：

- 每个人注册账号，管理员审核和绑定现实人员档案。
- 管理员维护腾讯会议显示名和系统人员的对应关系。
- 保存两段固定腾讯会议链接：第一部分美国代运营周报、第二部分内部经营复盘会。
- 美国代运营从 2026-06-22 中国时间这次周会开始，会前填写直营店周报。
- 每个人可在会前填写“我要提的问题/需要谁配合/建议处理方式”。
- 会后上传腾讯会议导出的 Part 1 / Part 2 文字记录，系统归档到同一周会议。
- 会议最后维护行动项：负责人、截止日期、状态。

## 本地运行

```powershell
cd C:\Users\caipi\Documents\美国工作\kicksgo-meeting-system
python app.py
```

打开：

```text
http://localhost:10000
```

本地没有 Firebase 配置时，系统会使用：

```text
data/state.json
data/transcripts/*.txt
```

## 初始账号

管理员账号：

```text
用户名：admin
密码：Kicksgo-Admin-2026!
```

你的普通管理账号：

```text
用户名：boss
密码：Kicksgo-Boss-2026!
```

生产环境请在 Render 环境变量里改：

```text
DEFAULT_ADMIN_PASSWORD
DEFAULT_BOSS_PASSWORD
SESSION_SECRET
```

第一次登录后系统会提示修改临时密码。

## Firebase / Render 部署

Render 新建服务时，建议使用本目录的 `render.yaml`，不要覆盖根目录现有 StockX/GOAT 服务。

需要配置这些环境变量：

```text
CLOUD_STORAGE_BACKEND=firebase
FIREBASE_PROJECT_ID=你的Firebase项目ID
FIREBASE_COLLECTION_PREFIX=kicksgo_meeting
FIREBASE_SERVICE_ACCOUNT_B64=Firebase服务账号JSON的base64
SESSION_SECRET=一串很长的随机字符串
```

PowerShell 生成服务账号 base64 示例：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("firebase-service-account.json"))
```

## 管理员上线后要补的信息

1. 在“管理员 / 固定腾讯会议链接”里填：
   - 第一部分腾讯会议链接、会议号、密码
   - 第二部分腾讯会议链接、会议号、密码
2. 在“人员档案”里补每个人现实姓名、负责业务和腾讯会议别名。
3. 审核注册账号，把系统账号绑定到对应人员。
4. 如果有人忘记密码，用“重置密码”生成临时密码，不查看旧密码。

## 当前第一版边界

- 文字记录只做保存和发言人别名匹配，不自动生成 AI 会议纪要。
- 如果多人共用一个腾讯会议账号，系统只能识别这个会议显示名，不能准确判断每句话是谁说的。
- 建议所有人单独进入腾讯会议，并使用管理员登记过的显示名。
