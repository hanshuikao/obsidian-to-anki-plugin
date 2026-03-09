const obsidian = require('obsidian');

class Anki408SyncPlugin extends obsidian.Plugin {
    async onload() {
        this.addCommand({
            id: 'sync-408',
            name: '同步当前笔记到 Anki (408专用)',
            callback: () => {
                let file = this.app.workspace.getActiveFile();
                if (file) this.syncFile(file);
                else new obsidian.Notice("没有打开的笔记！");
            }
        });
    }

    async syncFile(file) {
        let content = await this.app.vault.read(file);
        
        // 自动读取牌组名
        let deckMatch = content.match(/TARGET DECK:\s*(.+)/);
        let deckName = deckMatch ? deckMatch[1].trim() : "默认牌组";

        // 自动读取模板名 (新增功能！)
        let modelMatch = content.match(/TARGET MODEL:\s*(.+)/);
        let modelName = modelMatch ? modelMatch[1].trim() : "基础";

        try { await this.ankiConnect('createDeck', { deck: deckName }); } catch(e){}

        let blocks = content.match(/【开始】([\s\S]*?)【结束】/g);
        if (!blocks) {
            new obsidian.Notice("⚠️ 没找到 【开始】 和 【结束】 标签！");
            return;
        }

        let successCount = 0;
        let errorMsg = ""; 

        for (let block of blocks) {
            let innerContent = block.replace(/【开始】/g, '').replace(/【结束】/g, '');
            
            let qMatch = innerContent.match(/[Qq][:\uff1a]\s*([\s\S]*?)(?=[Aa][:\uff1a])/);
            let aMatch = innerContent.match(/[Aa][:\uff1a]\s*([\s\S]*)/);
            if (!qMatch || !aMatch) continue;

            let front = qMatch[1].trim();
            let back = aMatch[1].trim();

            let imgRegex = /!\[\[(.*?)\]\]/g;
            let match;
            while ((match = imgRegex.exec(back)) !== null) {
                let imgName = match[1];
                let imgFile = this.app.metadataCache.getFirstLinkpathDest(imgName, file.path);
                if (imgFile) {
                    let imgData = await this.app.vault.readBinary(imgFile);
                    let base64 = this.arrayBufferToBase64(imgData);
                    try {
                        await this.ankiConnect('storeMediaFile', { filename: imgName, data: base64 });
                        back = back.replace(match[0], `<img src="${imgName}">`);
                    } catch (e) { }
                }
            }

            // 构建卡片
            let note = {
                deckName: deckName,
                modelName: modelName, // 这里现在会自动读取你笔记里写的模板名！
                fields: { 
                    "正面": front, // ⚠️注意：如果你的模板字段不叫"正面"和"背面"，请在这里修改代码！
                    "背面": back   
                },
                options: { allowDuplicate: false },
                tags: ["408复习"]
            };

            try {
                let res = await this.ankiConnect('addNote', { note: note });
                if (res && res.error) {
                    if (res.error.includes("duplicate")) {
                        successCount++; 
                    } else {
                        errorMsg = res.error; 
                    }
                } else {
                    successCount++;
                }
            } catch (e) { errorMsg = "Anki 连接失败"; }
        }

        if (successCount > 0) {
            new obsidian.Notice(`✅ 成功同步了 ${successCount} 张卡片！`);
        } else if (errorMsg) {
            new obsidian.Notice(`❌ Anki 拒收，原因: ${errorMsg}`);
        } else {
            new obsidian.Notice(`⚠️ 同步了 0 张，请检查 Q: 和 A: 格式。`);
        }
    }

    async ankiConnect(action, params) {
        let response = await fetch('http://127.0.0.1:8765', {
            method: 'POST',
            body: JSON.stringify({ action: action, version: 6, params: params })
        });
        return await response.json();
    }

    arrayBufferToBase64(buffer) {
        let binary = '';
        let bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}

module.exports = Anki408SyncPlugin;