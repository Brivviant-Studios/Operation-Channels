Brivviant Channels Platform — Same UI GitHub Sync Fix

هذه النسخة مبنية على نفس الـ UI السابق بدون تغيير في الشكل.
تم تعديل script.js فقط لجعل الحفظ على GitHub أوضح وأقوى، مع إزالة inline JS من الكروت لتجنب مشاكل CSP.

التشغيل:
1. عدّل config.js ببيانات GitHub.
2. تأكد أن GITHUB_DATA_PATH = data/platform-state.json.
3. التوكن لازم Contents Read/Write.
4. ارفع الملفات على GitHub Pages.
5. بعد إضافة تاسك راقب data/platform-state.json: لازم tasks تتحدث.

لو ظهر خطأ 401/403: مشكلة توكن أو صلاحيات.
لو 404: owner/repo/branch/path غلط.
لو 409: اضغط Reload من المتصفح ثم احفظ مرة أخرى.
