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
        
        let deckMatch = content.match(/TARGET DECK:\s*(.+)/);
        let deckName = deckMatch ? deckMatch[1].trim() : "默认牌组";

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

            let imgRegex = /!\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g;
            let match;
            while ((match = imgRegex.exec(back)) !== null) {
                let imgName = match[1].trim(); 
                let fullMatch = match[0]; 
                let imgFile = this.app.metadataCache.getFirstLinkpathDest(imgName, file.path);
                if (imgFile) {
                    let imgData = await this.app.vault.readBinary(imgFile);
                    let base64 = this.arrayBufferToBase64(imgData);
                    try {
                        await this.ankiConnect('storeMediaFile', { filename: imgName, data: base64 });
                        back = back.replace(fullMatch, `<img src="${imgName}">`);
                    } catch (e) {}
                }
            }

            back = back.replace(/\$\$(.*?)\$\$/gs, '\\\\[$1\\\\]');
            back = back.replace(/\$(.*?)\$/g, '\\\\($1\\\\)');
            front = front.replace(/\$\$(.*?)\$\$/gs, '\\\\[$1\\\\]');
            front = front.replace(/\$(.*?)\$/g, '\\\\($1\\\\)');

            const formatToHTML = (text) => {
                text = text.replace(/==([^\s\n](?:[^=\n]*?[^\s\n])?)==/g, '<mark style="background-color: #ffeb3b; color: #111; padding: 0 4px; border-radius: 3px; font-weight: bold;">$1</mark>');
                text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
                text = text.replace(/^### (.*$)/gm, '<h3 style="margin-top: 10px; margin-bottom: 5px;">$1</h3>');
                text = text.replace(/^## (.*$)/gm, '<h2 style="margin-top: 10px; margin-bottom: 5px;">$1</h2>');
                text = text.replace(/^# (.*$)/gm, '<h1 style="margin-top: 10px; margin-bottom: 5px;">$1</h1>');
                text = text.replace(/\n/g, '<br>');
                return text;
            };

            // 🌟 核心修复：强制包裹左对齐样式，直接打败 Anki 的默认居中！
            front = `<div style="text-align: left; line-height: 1.6;">${formatToHTML(front)}</div>`;
            back = `<div style="text-align: left; line-height: 1.6;">${formatToHTML(back)}</div>`;

            let note = {
                deckName: deckName,
                modelName: modelName, 
                fields: { "正面": front, "背面": back },
                options: { allowDuplicate: false },
                tags: ["408复习"]
            };

            try {
                let res = await this.ankiConnect('addNote', { note: note });
                if (res && res.error) {
                    if (res.error.includes("duplicate")) successCount++; 
                    else errorMsg = res.error; 
                } else {
                    successCount++;
                }
            } catch (e) { errorMsg = "Anki 连接失败"; }
        }

        if (successCount > 0) new obsidian.Notice(`✅ 成功同步了 ${successCount} 张卡片！`);
        else if (errorMsg) new obsidian.Notice(`❌ Anki 拒收，原因: ${errorMsg}`);
        else new obsidian.Notice(`⚠️ 同步了 0 张，请检查 Q: 和 A: 格式。`);
    }

    async ankiConnect(action, params) {
        let response = await fetch('[http://127.0.0.1:8765](http://127.0.0.1:8765)', {
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
