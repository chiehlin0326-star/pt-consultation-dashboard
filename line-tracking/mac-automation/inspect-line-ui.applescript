-- 探測 LINE 電腦版目前視窗的 UI 元件，輸出到 ~/Desktop/line-ui-dump.txt
-- 用法：先在 LINE 打開目標聊天室，然後執行 osascript inspect-line-ui.applescript
-- 把產生的檔案給 Claude，據此校正 export-line-chat.applescript 裡的元件名稱。
set outFile to (POSIX path of (path to desktop)) & "line-ui-dump.txt"
tell application "LINE" to activate
delay 1
set dump to ""
tell application "System Events"
	tell process "LINE"
		set dump to dump & "windows: " & (count of windows) & linefeed
		repeat with w in windows
			set dump to dump & "== window: " & (name of w as text) & linefeed
			set els to entire contents of w
			repeat with e in els
				try
					set r to role of e
					set n to ""
					try
						set n to name of e as text
					end try
					set d to ""
					try
						set d to description of e as text
					end try
					set v to ""
					try
						set v to value of e as text
					end try
					if (n is not "") or (d is not "") or (v is not "") then
						set dump to dump & r & " | name=" & n & " | desc=" & d & " | value=" & (text 1 thru (min(80, length of v)) of (v & "")) & linefeed
					end if
				end try
			end repeat
		end repeat
	end tell
end tell
do shell script "cat > " & quoted form of outFile & " <<'TXT'" & linefeed & dump & linefeed & "TXT"
display notification "已輸出到 Desktop/line-ui-dump.txt" with title "LINE UI 探測"
