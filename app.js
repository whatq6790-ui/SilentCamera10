document.addEventListener('DOMContentLoaded', () => {
    // 要素の取得
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('photo-canvas');
    const shutterBtn = document.getElementById('shutter-btn');
    const switchBtn = document.getElementById('camera-switch-btn');
    const flashOverlay = document.getElementById('flash-overlay');
    const thumbBtn = document.getElementById('gallery-btn');
    const lastPhotoThumb = document.getElementById('last-photo-thumb');

    // ギャラリー要素
    const galleryModal = document.getElementById('gallery-modal');
    const galleryGrid = document.getElementById('gallery-grid');
    const galleryCloseBtn = document.getElementById('gallery-close-btn');
    const gallerySelectModeBtn = document.getElementById('gallery-select-mode-btn');
    const galleryActions = document.getElementById('gallery-actions');
    const downloadSelectedBtn = document.getElementById('download-selected-btn');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const selectedCountDisplay = document.querySelector('.selected-count');

    // 状態管理
    let currentStream = null;
    let facialMode = 'environment'; // 'user' or 'environment'
    let isSelectMode = false;
    let selectedImageKeys = new Set();
    let longPressTimer = null;

    // --- カメラ機能 ---

    // カメラを開始する関数
    async function startCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: {
                facingMode: facialMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
        } catch (err) {
            console.error('カメラの起動に失敗しました:', err);
            alert('カメラの使用を許可してください。');
        }
    }

    // カメラ切り替え
    switchBtn.addEventListener('click', () => {
        facialMode = facialMode === 'environment' ? 'user' : 'environment';
        startCamera();
    });

    // シャッターボタン
    shutterBtn.addEventListener('click', takePhoto);

    // 写真撮影
    function takePhoto() {
        // フラッシュ効果
        flashOverlay.style.opacity = '1';
        setTimeout(() => {
            flashOverlay.style.opacity = '0';
        }, 100);

        // Canvas設定
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        // 映像が左右反転している場合（フロントカメラなど）の考慮が必要だが、
        // 今回はシンプルに描画
        if (facialMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 画像保存
        try {
            const imageData = canvas.toDataURL('image/jpeg', 0.85); // 画質85%
            const timestamp = new Date().getTime();
            const key = `img_${timestamp}`;

            // LocalStorage制限チェック
            try {
                localStorage.setItem(key, imageData);
                updateThumbnail(imageData);
            } catch (e) {
                alert('保存容量がいっぱいです。ギャラリーから古い写真を削除してください。');
            }
        } catch (err) {
            console.error('撮影エラー:', err);
        }
    }

    // --- ギャラリー機能 ---

    // サムネイル更新
    function updateThumbnail(src) {
        if (src) {
            lastPhotoThumb.src = src;
        } else {
            // 最新の画像を探す
            const keys = getAllImageKeys();
            if (keys.length > 0) {
                const lastKey = keys[0];
                lastPhotoThumb.src = localStorage.getItem(lastKey);
            } else {
                lastPhotoThumb.src = ''; // またはプレースホルダー
            }
        }
    }

    // 全画像のキーを取得（新しい順）
    function getAllImageKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('img_')) {
                keys.push(key);
            }
        }
        return keys.sort().reverse();
    }

    // ギャラリーを開く
    thumbBtn.addEventListener('click', () => {
        renderGallery();
        galleryModal.classList.add('open');
    });

    // ギャラリーを閉じる
    galleryCloseBtn.addEventListener('click', () => {
        closeGallery();
    });

    function closeGallery() {
        galleryModal.classList.remove('open');
        exitSelectMode();
    }

    // ギャラリー描画
    function renderGallery() {
        galleryGrid.innerHTML = '';
        const keys = getAllImageKeys();

        keys.forEach(key => {
            const imageData = localStorage.getItem(key);
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.dataset.key = key;

            const img = document.createElement('img');
            img.src = imageData;
            img.loading = 'lazy';

            const checkIcon = document.createElement('div');
            checkIcon.className = 'check-icon';
            checkIcon.innerHTML = '<svg width="14" height="14"><use href="#icon-check"/></svg>';

            div.appendChild(img);
            div.appendChild(checkIcon);
            galleryGrid.appendChild(div);

            // イベントリスナー
            addGalleryItemEvents(div, key);
        });

        // 最後の写真をサムネイルに設定（同期）
        updateThumbnail();
    }

    // ギャラリーアイテムのイベント（クリック・長押し）
    function addGalleryItemEvents(element, key) {
        // クリック
        element.addEventListener('click', (e) => {
            if (isSelectMode) {
                toggleSelection(key, element);
            } else {
                // プレビュー表示（簡易的に実装）
                // 本来はプレビューモーダルを開く
                // const imageData = localStorage.getItem(key);
                // openPreview(imageData);
                // タップクリックでプレビューを開く
                openPreview(key);
            }
        });

        // 長押し（タッチデバイス用）
        element.addEventListener('touchstart', (e) => {
            if (!isSelectMode) {
                longPressTimer = setTimeout(() => {
                    enterSelectMode();
                    toggleSelection(key, element);
                    // 振動フィードバックがあれば良いがWebでは限定的
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 500); // 500ms長押し
            }
        }, { passive: true });

        element.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });

        element.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        });

        // PC用（右クリックなど）
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!isSelectMode) {
                enterSelectMode();
                toggleSelection(key, element);
            }
        });
    }

    // --- 選択モード ---

    // 選択モード開始ボタン
    gallerySelectModeBtn.addEventListener('click', () => {
        if (isSelectMode) {
            exitSelectMode();
        } else {
            enterSelectMode();
        }
    });

    function enterSelectMode() {
        isSelectMode = true;
        galleryModal.classList.add('selecting');
        galleryActions.classList.remove('hidden');
        gallerySelectModeBtn.textContent = '完了';
        updateActionButtons();
    }

    function exitSelectMode() {
        isSelectMode = false;
        selectedImageKeys.clear();
        galleryModal.classList.remove('selecting');
        galleryActions.classList.add('hidden');
        gallerySelectModeBtn.textContent = '選択';

        // UIリセット
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.classList.remove('selected');
            item.classList.remove('selecting'); // CSSクラスがあれば
        });
        updateActionButtons();
    }

    function toggleSelection(key, element) {
        if (selectedImageKeys.has(key)) {
            selectedImageKeys.delete(key);
            element.classList.remove('selected');
        } else {
            selectedImageKeys.add(key);
            element.classList.add('selected');
        }
        updateActionButtons();
    }

    function updateActionButtons() {
        const count = selectedImageKeys.size;
        selectedCountDisplay.textContent = `${count}枚選択`;

        downloadSelectedBtn.disabled = count === 0;
        deleteSelectedBtn.disabled = count === 0;
    }

    // --- 一括操作 ---

    // 一括ダウンロード
    downloadSelectedBtn.addEventListener('click', () => {
        if (selectedImageKeys.size === 0) return;

        const keys = Array.from(selectedImageKeys);
        let downloadCount = 0;

        keys.forEach((key, index) => {
            const dataUrl = localStorage.getItem(key);
            // ダウンロードリンク作成
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `photo_${key.replace('img_', '')}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, index * 200); // ブラウザがブロックしないよう少し遅延させる
            downloadCount++;
        });

        // アラートは出さない方がスムーズかも
    });

    // 一括削除
    deleteSelectedBtn.addEventListener('click', () => {
        if (selectedImageKeys.size === 0) return;

        if (confirm(`${selectedImageKeys.size}枚の写真を削除しますか？`)) {
            selectedImageKeys.forEach(key => {
                localStorage.removeItem(key);
            });
            renderGallery(); // 再描画
            exitSelectMode(); // 選択モード終了
        }
    });

    // プレビュー機能
    const previewModal = document.getElementById('photo-preview-modal');
    const previewImage = document.getElementById('preview-image');
    const previewCloseBtn = document.getElementById('preview-close-btn');
    const previewShareBtn = document.getElementById('preview-share-btn');
    const previewDeleteBtn = document.getElementById('preview-delete-btn');
    let currentPreviewKey = null;

    function openPreview(key) {
        currentPreviewKey = key;
        const dataUrl = localStorage.getItem(key);
        previewImage.src = dataUrl;
        previewModal.classList.add('open');
    }

    previewCloseBtn.addEventListener('click', () => {
        previewModal.classList.remove('open');
        currentPreviewKey = null;
    });

    // プレビュー画面での削除
    previewDeleteBtn.addEventListener('click', () => {
        if (!currentPreviewKey) return;

        if (confirm('この写真を削除しますか？')) {
            localStorage.removeItem(currentPreviewKey);
            renderGallery(); // ギャラリーを更新
            previewModal.classList.remove('open'); // プレビューを閉じる
            updateThumbnail();
        }
    });

    // プレビュー画面での共有（Web Share API / ダウンロード）
    previewShareBtn.addEventListener('click', async () => {
        if (!currentPreviewKey) return;

        const dataUrl = localStorage.getItem(currentPreviewKey);

        // Base64からBlobを作成
        const fetchRes = await fetch(dataUrl);
        const blob = await fetchRes.blob();
        const file = new File([blob], `photo_${currentPreviewKey.replace('img_', '')}.jpg`, { type: 'image/jpeg' });

        // Web Share APIが使える場合
        if (navigator.share) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Silent Camera Photo',
                    text: '写真を表示'
                });
            } catch (err) {
                console.log('共有キャンセルまたは失敗', err);
                downloadFile(dataUrl, currentPreviewKey);
            }
        } else {
            // 使えない場合はダウンロード
            downloadFile(dataUrl, currentPreviewKey);
        }
    });

    function downloadFile(dataUrl, key) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `photo_${key.replace('img_', '')}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // 初期化
    startCamera();
    updateThumbnail();
});
