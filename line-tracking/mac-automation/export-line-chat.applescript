-- 自動匯出指定 LINE 聊天室的聊天記錄到 Google Drive 收件匣
-- 用法：osascript export-line-chat.applescript "聊天室名稱" "/目的資料夾/路徑"
-- 流程：啟動 LINE → 搜尋聊天室 → 開啟 → 聊天室選單 → 匯出聊天記錄 → 存檔對話框 → 指定資料夾
-- [需要確認] 以下元件名稱依 LINE Mac 版 UI 撰寫，實際名稱請用 inspect-line-ui.applescript 探測後校正。

on run argv
	if (count of argv) < 2 then error "用法：osascript export-line-chat.applescript \"聊天室名稱\" \"/目的資料夾\""
	set chatName to item 1 of argv
	set destFolder to item 2 of argv
	set exportLabels to {"匯出聊天記錄", "Export chat history", "聊天記錄備份"} -- 可能的選單文字
	set menuLabels to {"選單", "Menu", "更多", "More"} -- 聊天室右上角 ≡ 按鈕的輔助使用名稱

	tell application "LINE" to activate
	delay 2

	tell application "System Events"
		tell process "LINE"
			set frontmost to true
			-- 1) 搜尋聊天室：LINE 主視窗左上搜尋框
			keystroke "f" using {command down}
			delay 0.5
			keystroke "a" using {command down}
			keystroke chatName
			delay 1.5
			key code 36 -- Return：開啟第一個搜尋結果
			delay 2

			-- 2) 找到聊天室選單按鈕並點擊
			set clicked to false
			repeat with lbl in menuLabels
				if clicked then exit repeat
				try
					set btns to (every button of window 1 whose description is lbl or name is lbl)
					if (count of btns) > 0 then
						click item 1 of btns
						set clicked to true
					end if
				end try
			end repeat
			if not clicked then
				-- 退而求其次：點視窗右上角倒數第一個按鈕
				try
					set allBtns to every button of window 1
					click item -1 of allBtns
					set clicked to true
				end try
			end if
			if not clicked then error "找不到聊天室選單按鈕，請先執行 inspect-line-ui.applescript"
			delay 1.5

			-- 3) 點「匯出聊天記錄」
			set exported to false
			repeat with lbl in exportLabels
				if exported then exit repeat
				try
					set targets to (every UI element of entire contents of window 1 whose name is lbl or description is lbl)
					if (count of targets) > 0 then
						click item 1 of targets
						set exported to true
					end if
				end try
				if not exported then
					try
						set targets to (every UI element of entire contents of window 1 whose value is lbl)
						if (count of targets) > 0 then
							click item 1 of targets
							set exported to true
						end if
					end try
				end if
			end repeat
			if not exported then error "找不到「匯出聊天記錄」選項，請先執行 inspect-line-ui.applescript"
			delay 2

			-- 4) 存檔對話框：⌘⇧G 輸入目的資料夾，再按 Return 存檔
			repeat 20 times
				if exists sheet 1 of window 1 then exit repeat
				if exists window "儲存" then exit repeat
				delay 0.5
			end repeat
			keystroke "g" using {command down, shift down}
			delay 1
			keystroke destFolder
			delay 0.5
			key code 36
			delay 1
			key code 36 -- 存檔
			delay 2
			-- 若檔名重複出現「取代」詢問，按 Return 取代（匯入管線會去重）
			try
				if exists sheet 1 of sheet 1 of window 1 then key code 36
			end try
		end tell
	end tell
	do shell script "echo \"$(date '+%F %T') 匯出完成：" & chatName & "\" >> ~/Library/Logs/line-export.log"
end run
