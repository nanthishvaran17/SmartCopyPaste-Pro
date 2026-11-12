using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace SmartPastePro
{
    public class MainForm : Form
    {
        // Win32 API imports for window management and global keys
        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        private const int KEYEVENTF_KEYUP = 0x0002;
        private const byte VK_ESCAPE = 0x1B;

        // UI Controls
        private TextBox txtInput;
        private Label lblStatus;
        private Label lblStats;
        private Button btnStartType;
        private Button btnStopType;
        private Button btnClear;
        private Button btnPasteClip;
        private Button btnLaunchAppMode;
        private Button btnOpenExtensionPage;
        private RadioButton rbInstant;
        private RadioButton rbUltra;
        private RadioButton rbFast;
        private RadioButton rbHuman;
        private NumericUpDown numDelaySeconds;
        private ListBox lstClips;
        private NotifyIcon trayIcon;
        private System.Windows.Forms.Timer countdownTimer;

        // State variables
        private Thread typingThread = null;
        private volatile bool isTyping = false;
        private int remainingSeconds = 0;
        private readonly List<string> clipHistory = new List<string>();
        private readonly string historyFilePath;

        public MainForm()
        {
            this.historyFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "clips_history.txt");
            InitializeComponents();
            LoadClipHistory();
            UpdateStats();
        }

        private void InitializeComponents()
        {
            this.Text = "SmartPaste Pro - Desktop Suite";
            this.Size = new Size(720, 680);
            this.MinimumSize = new Size(640, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(14, 17, 23); // #0e1117
            this.ForeColor = Color.FromArgb(230, 237, 243);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Try to set icon if exists
            string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icons", "icon.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch { }
            }

            // Top Header Panel
            Panel headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 62,
                BackColor = Color.FromArgb(22, 27, 34),
                Padding = new Padding(18, 12, 18, 12)
            };

            Label lblTitle = new Label
            {
                Text = "SmartPaste Pro [DESKTOP PRO ENGINE]",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                ForeColor = Color.FromArgb(88, 166, 255),
                AutoSize = true,
                Location = new Point(16, 10)
            };

            Label lblSubtitle = new Label
            {
                Text = "High-speed typing simulator, clipboard engine & standalone desktop suite",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(139, 148, 158),
                AutoSize = true,
                Location = new Point(17, 34)
            };

            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSubtitle);
            this.Controls.Add(headerPanel);

            // Tab Control for Mode Switching
            TabControl tabs = new TabControl
            {
                Dock = DockStyle.Fill,
                Padding = new Point(12, 6)
            };

            TabPage tabTyper = new TabPage("Typing Engine") { BackColor = Color.FromArgb(14, 17, 23) };
            TabPage tabBrowser = new TabPage("Browser Integration") { BackColor = Color.FromArgb(14, 17, 23) };
            TabPage tabHistory = new TabPage("Clip Library") { BackColor = Color.FromArgb(14, 17, 23) };

            tabs.TabPages.Add(tabTyper);
            tabs.TabPages.Add(tabBrowser);
            tabs.TabPages.Add(tabHistory);
            this.Controls.Add(tabs);

            // ==================== TAB 1: TYPER ENGINE ====================
            Panel typerContent = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
            tabTyper.Controls.Add(typerContent);

            // Speed Selector Group
            GroupBox grpSpeed = new GroupBox
            {
                Text = "SPEED & METHOD",
                ForeColor = Color.FromArgb(139, 148, 158),
                Dock = DockStyle.Top,
                Height = 65,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
            };

            rbInstant = new RadioButton { Text = "Instant (0ms)", Location = new Point(18, 26), AutoSize = true, ForeColor = Color.White };
            rbUltra = new RadioButton { Text = "Ultra (2500 WPM)", Location = new Point(140, 26), AutoSize = true, ForeColor = Color.White, Checked = true };
            rbFast = new RadioButton { Text = "Fast (800 WPM)", Location = new Point(285, 26), AutoSize = true, ForeColor = Color.White };
            rbHuman = new RadioButton { Text = "Human (300 WPM)", Location = new Point(415, 26), AutoSize = true, ForeColor = Color.White };

            grpSpeed.Controls.Add(rbInstant);
            grpSpeed.Controls.Add(rbUltra);
            grpSpeed.Controls.Add(rbFast);
            grpSpeed.Controls.Add(rbHuman);
            typerContent.Controls.Add(grpSpeed);

            // Input Editor
            Label lblEditor = new Label
            {
                Text = "SOURCE TEXT / CODE TO TYPE:",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(139, 148, 158),
                Dock = DockStyle.Top,
                Height = 24
            };
            typerContent.Controls.Add(lblEditor);

            txtInput = new TextBox
            {
                Multiline = true,
                ScrollBars = ScrollBars.Both,
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(22, 27, 34),
                ForeColor = Color.FromArgb(230, 237, 243),
                Font = new Font("Consolas", 10.5f, FontStyle.Regular),
                BorderStyle = BorderStyle.FixedSingle
            };
            txtInput.TextChanged += (s, e) => UpdateStats();
            typerContent.Controls.Add(txtInput);

            // Stats and quick actions row
            Panel statsPanel = new Panel { Dock = DockStyle.Bottom, Height = 34, Padding = new Padding(0, 6, 0, 0) };
            lblStats = new Label
            {
                Text = "0 words | 0 characters | 0 lines",
                ForeColor = Color.FromArgb(139, 148, 158),
                Font = new Font("Segoe UI", 8.5f),
                AutoSize = true,
                Location = new Point(0, 8)
            };
            btnPasteClip = CreateModernButton("Paste From Clipboard", 160, 26, Color.FromArgb(33, 38, 45));
            btnPasteClip.Location = new Point(380, 4);
            btnPasteClip.Click += (s, e) =>
            {
                if (Clipboard.ContainsText())
                {
                    txtInput.Text = Clipboard.GetText();
                    SaveToHistory(txtInput.Text);
                }
            };

            btnClear = CreateModernButton("Clear", 80, 26, Color.FromArgb(33, 38, 45));
            btnClear.Location = new Point(550, 4);
            btnClear.Click += (s, e) => txtInput.Clear();

            statsPanel.Controls.Add(lblStats);
            statsPanel.Controls.Add(btnPasteClip);
            statsPanel.Controls.Add(btnClear);
            typerContent.Controls.Add(statsPanel);

            // Execution Control Panel
            Panel execPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 90,
                BackColor = Color.FromArgb(22, 27, 34),
                Padding = new Padding(12)
            };

            Label lblDelayText = new Label
            {
                Text = "Delay before typing begins:",
                ForeColor = Color.FromArgb(139, 148, 158),
                AutoSize = true,
                Location = new Point(14, 16)
            };

            numDelaySeconds = new NumericUpDown
            {
                Minimum = 1,
                Maximum = 15,
                Value = 3,
                Width = 50,
                Location = new Point(185, 13),
                BackColor = Color.FromArgb(14, 17, 23),
                ForeColor = Color.White
            };

            Label lblSecondsText = new Label
            {
                Text = "seconds (time to focus target app window)",
                ForeColor = Color.FromArgb(139, 148, 158),
                AutoSize = true,
                Location = new Point(245, 16)
            };

            lblStatus = new Label
            {
                Text = "Ready. Enter your text and press START.",
                ForeColor = Color.FromArgb(63, 185, 80),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                AutoSize = true,
                Location = new Point(14, 52)
            };

            btnStartType = CreateModernButton("START AUTO-TYPING", 180, 36, Color.FromArgb(35, 134, 54));
            btnStartType.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnStartType.Location = new Point(360, 42);
            btnStartType.Click += (s, e) => StartTypingSequence();

            btnStopType = CreateModernButton("STOP (ESC)", 110, 36, Color.FromArgb(218, 54, 51));
            btnStopType.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnStopType.Location = new Point(550, 42);
            btnStopType.Enabled = false;
            btnStopType.Click += (s, e) => AbortTyping("Stopped by user.");

            execPanel.Controls.Add(lblDelayText);
            execPanel.Controls.Add(numDelaySeconds);
            execPanel.Controls.Add(lblSecondsText);
            execPanel.Controls.Add(lblStatus);
            execPanel.Controls.Add(btnStartType);
            execPanel.Controls.Add(btnStopType);
            typerContent.Controls.Add(execPanel);

            // ==================== TAB 2: BROWSER INTEGRATION ====================
            Panel browserContent = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24) };
            tabBrowser.Controls.Add(browserContent);

            Label lblBrowserTitle = new Label
            {
                Text = "Chrome Extension & Web Dashboard Launcher",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                ForeColor = Color.FromArgb(88, 166, 255),
                AutoSize = true,
                Location = new Point(10, 10)
            };
            browserContent.Controls.Add(lblBrowserTitle);

            Label lblBrowserDesc = new Label
            {
                Text = "You can run SmartPaste Pro directly inside Google Chrome, Microsoft Edge, Brave, or as an independent frameless desktop window.",
                ForeColor = Color.FromArgb(139, 148, 158),
                Size = new Size(620, 40),
                Location = new Point(12, 40)
            };
            browserContent.Controls.Add(lblBrowserDesc);

            btnLaunchAppMode = CreateModernButton("Launch Standalone App Window (Chrome/Edge)", 360, 42, Color.FromArgb(31, 111, 235));
            btnLaunchAppMode.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            btnLaunchAppMode.Location = new Point(14, 95);
            btnLaunchAppMode.Click += (s, e) => LaunchAppMode();
            browserContent.Controls.Add(btnLaunchAppMode);

            btnOpenExtensionPage = CreateModernButton("Open chrome://extensions in Browser", 360, 42, Color.FromArgb(33, 38, 45));
            btnOpenExtensionPage.Font = new Font("Segoe UI", 10f, FontStyle.Regular);
            btnOpenExtensionPage.Location = new Point(14, 150);
            btnOpenExtensionPage.Click += (s, e) => OpenExtensionsManager();
            browserContent.Controls.Add(btnOpenExtensionPage);

            Button btnCopyPath = CreateModernButton("Copy Extension Directory Path", 360, 42, Color.FromArgb(33, 38, 45));
            btnCopyPath.Font = new Font("Segoe UI", 10f, FontStyle.Regular);
            btnCopyPath.Location = new Point(14, 205);
            btnCopyPath.Click += (s, e) =>
            {
                string dir = AppDomain.CurrentDomain.BaseDirectory;
                Clipboard.SetText(dir);
                MessageBox.Show("Extension path copied to clipboard:\n" + dir + "\n\nIn Chrome, enable 'Developer Mode' and click 'Load unpacked', then paste this path.", "Path Copied", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };
            browserContent.Controls.Add(btnCopyPath);

            // ==================== TAB 3: CLIP HISTORY ====================
            Panel historyContent = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
            tabHistory.Controls.Add(historyContent);

            Label lblHist = new Label
            {
                Text = "SAVED CLIPS & CODE SNIPPETS (Double click to load into editor):",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(139, 148, 158),
                Dock = DockStyle.Top,
                Height = 26
            };
            historyContent.Controls.Add(lblHist);

            lstClips = new ListBox
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(22, 27, 34),
                ForeColor = Color.FromArgb(230, 237, 243),
                Font = new Font("Consolas", 10f),
                BorderStyle = BorderStyle.FixedSingle
            };
            lstClips.DoubleClick += (s, e) =>
            {
                if (lstClips.SelectedIndex >= 0 && lstClips.SelectedIndex < clipHistory.Count)
                {
                    txtInput.Text = clipHistory[lstClips.SelectedIndex];
                    tabs.SelectedIndex = 0; // Switch to typer tab
                }
            };
            historyContent.Controls.Add(lstClips);

            Panel histButtons = new Panel { Dock = DockStyle.Bottom, Height = 45, Padding = new Padding(0, 10, 0, 0) };
            Button btnLoadSelected = CreateModernButton("Load Selected Clip", 160, 32, Color.FromArgb(31, 111, 235));
            btnLoadSelected.Location = new Point(0, 6);
            btnLoadSelected.Click += (s, e) =>
            {
                if (lstClips.SelectedIndex >= 0 && lstClips.SelectedIndex < clipHistory.Count)
                {
                    txtInput.Text = clipHistory[lstClips.SelectedIndex];
                    tabs.SelectedIndex = 0;
                }
            };

            Button btnClearHist = CreateModernButton("Clear All History", 140, 32, Color.FromArgb(218, 54, 51));
            btnClearHist.Location = new Point(175, 6);
            btnClearHist.Click += (s, e) =>
            {
                clipHistory.Clear();
                lstClips.Items.Clear();
                try { if (File.Exists(historyFilePath)) File.Delete(historyFilePath); } catch { }
            };

            histButtons.Controls.Add(btnLoadSelected);
            histButtons.Controls.Add(btnClearHist);
            historyContent.Controls.Add(histButtons);

            // Countdown Timer
            countdownTimer = new System.Windows.Forms.Timer();
            countdownTimer.Interval = 1000;
            countdownTimer.Tick += CountdownTimer_Tick;

            // System Tray Setup
            SetupTray();
        }

        private Button CreateModernButton(string text, int width, int height, Color bgColor)
        {
            Button btn = new Button
            {
                Text = text,
                Width = width,
                Height = height,
                BackColor = bgColor,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        private void SetupTray()
        {
            trayIcon = new NotifyIcon();
            trayIcon.Text = "SmartPaste Pro Desktop";
            string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icons", "icon.ico");
            if (File.Exists(icoPath))
            {
                try { trayIcon.Icon = new Icon(icoPath); } catch { }
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            ContextMenu contextMenu = new ContextMenu();
            contextMenu.MenuItems.Add("Open SmartPaste Pro", (s, e) => { this.Show(); this.WindowState = FormWindowState.Normal; });
            contextMenu.MenuItems.Add("Exit", (s, e) => { trayIcon.Visible = false; Application.Exit(); });
            trayIcon.ContextMenu = contextMenu;
            trayIcon.DoubleClick += (s, e) => { this.Show(); this.WindowState = FormWindowState.Normal; };
            trayIcon.Visible = true;
        }

        private void UpdateStats()
        {
            string txt = txtInput.Text;
            int chars = txt.Length;
            int words = string.IsNullOrWhiteSpace(txt) ? 0 : txt.Split(new char[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries).Length;
            int lines = string.IsNullOrWhiteSpace(txt) ? 0 : txt.Split('\n').Length;
            lblStats.Text = string.Format("{0} words | {1} characters | {2} lines", words, chars, lines);
        }

        private void StartTypingSequence()
        {
            string content = txtInput.Text;
            if (string.IsNullOrEmpty(content))
            {
                MessageBox.Show("Please enter or paste the text/code you wish to type.", "Empty Input", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            SaveToHistory(content);

            remainingSeconds = (int)numDelaySeconds.Value;
            lblStatus.Text = string.Format("Switch to your target app window NOW! Typing in {0}s...", remainingSeconds);
            lblStatus.ForeColor = Color.FromArgb(210, 153, 34);

            btnStartType.Enabled = false;
            btnStopType.Enabled = true;

            countdownTimer.Start();
        }

        private void CountdownTimer_Tick(object sender, EventArgs e)
        {
            remainingSeconds--;
            if (remainingSeconds > 0)
            {
                lblStatus.Text = string.Format("Switch to your target app window NOW! Typing in {0}s...", remainingSeconds);
            }
            else
            {
                countdownTimer.Stop();
                ExecuteTyping();
            }
        }

        private void ExecuteTyping()
        {
            string text = txtInput.Text;
            int delayMs = 0;
            bool isInstant = rbInstant.Checked;

            if (rbUltra.Checked) delayMs = 24;      // ~2500 WPM
            else if (rbFast.Checked) delayMs = 75;  // ~800 WPM
            else if (rbHuman.Checked) delayMs = 200; // ~300 WPM

            isTyping = true;
            lblStatus.Text = "Typing actively into focused window... (Press ESC to stop)";
            lblStatus.ForeColor = Color.FromArgb(56, 139, 253);

            typingThread = new Thread(() =>
            {
                try
                {
                    if (isInstant)
                    {
                        // Direct clipboard paste simulation: Ctrl + V
                        this.Invoke((MethodInvoker)delegate
                        {
                            Clipboard.SetText(text);
                        });
                        Thread.Sleep(80);
                        SendKeys.SendWait("^v");
                    }
                    else
                    {
                        Random rnd = new Random();
                        for (int i = 0; i < text.Length; i++)
                        {
                            if (!isTyping) break;

                            char c = text[i];
                            SendChar(c);

                            int currentDelay = delayMs;
                            if (rbHuman.Checked)
                            {
                                // Natural human jitter
                                currentDelay = rnd.Next(Math.Max(50, delayMs - 70), delayMs + 80);
                                if (c == '\n' || c == '.') currentDelay += 150;
                            }

                            Thread.Sleep(currentDelay);
                        }
                    }

                    this.Invoke((MethodInvoker)delegate
                    {
                        isTyping = false;
                        btnStartType.Enabled = true;
                        btnStopType.Enabled = false;
                        lblStatus.Text = "Finished typing successfully!";
                        lblStatus.ForeColor = Color.FromArgb(63, 185, 80);
                    });
                }
                catch (Exception ex)
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        AbortTyping("Error: " + ex.Message);
                    });
                }
            });

            typingThread.IsBackground = true;
            typingThread.Start();
        }

        private void SendChar(char c)
        {
            try
            {
                if (c == '\r') return; // Handled with \n
                if (c == '\n')
                {
                    SendKeys.SendWait("{ENTER}");
                    return;
                }

                // Characters requiring escaping in SendKeys
                string s = c.ToString();
                if ("+^%~{}[]()".IndexOf(c) >= 0)
                {
                    s = "{" + c + "}";
                }
                SendKeys.SendWait(s);
            }
            catch
            {
                // Fallback for special unicode
                try
                {
                    SendKeys.SendWait(c.ToString());
                }
                catch { }
            }
        }

        private void AbortTyping(string reason)
        {
            isTyping = false;
            if (countdownTimer != null) countdownTimer.Stop();
            if (typingThread != null && typingThread.IsAlive)
            {
                try { typingThread.Abort(); } catch { }
            }

            btnStartType.Enabled = true;
            btnStopType.Enabled = false;
            lblStatus.Text = reason;
            lblStatus.ForeColor = Color.FromArgb(248, 81, 73);
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.Escape && isTyping)
            {
                AbortTyping("Emergency Stop: Escape pressed.");
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void LaunchAppMode()
        {
            string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "popup", "popup.html");
            string chromePath = FindBrowserExecutable();

            if (string.IsNullOrEmpty(chromePath))
            {
                Process.Start(htmlPath);
                return;
            }

            string args = string.Format("--app=\"file:///{0}\" --window-size=480,720", htmlPath.Replace('\\', '/'));
            try
            {
                Process.Start(chromePath, args);
            }
            catch
            {
                Process.Start(htmlPath);
            }
        }

        private void OpenExtensionsManager()
        {
            string chromePath = FindBrowserExecutable();
            if (!string.IsNullOrEmpty(chromePath))
            {
                try
                {
                    Process.Start(chromePath, "chrome://extensions");
                    return;
                }
                catch { }
            }
            Process.Start("https://www.google.com/chrome");
        }

        private string FindBrowserExecutable()
        {
            string[] possiblePaths = new string[]
            {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
            };

            foreach (string p in possiblePaths)
            {
                if (File.Exists(p)) return p;
            }
            return null;
        }

        private void SaveToHistory(string clip)
        {
            if (string.IsNullOrWhiteSpace(clip)) return;
            clip = clip.Trim();
            if (clipHistory.Contains(clip))
            {
                clipHistory.Remove(clip);
            }
            clipHistory.Insert(0, clip);

            // Keep top 50
            if (clipHistory.Count > 50) clipHistory.RemoveAt(50);

            RefreshClipList();

            try
            {
                File.WriteAllLines(historyFilePath, clipHistory.ToArray(), Encoding.UTF8);
            }
            catch { }
        }

        private void LoadClipHistory()
        {
            clipHistory.Clear();
            if (File.Exists(historyFilePath))
            {
                try
                {
                    string[] lines = File.ReadAllLines(historyFilePath, Encoding.UTF8);
                    StringBuilder current = new StringBuilder();
                    foreach (string l in lines)
                    {
                        if (l == "---CLIP_DIVIDER---")
                        {
                            if (current.Length > 0)
                            {
                                clipHistory.Add(current.ToString());
                                current.Clear();
                            }
                        }
                        else
                        {
                            current.AppendLine(l);
                        }
                    }
                    if (current.Length > 0) clipHistory.Add(current.ToString());
                }
                catch { }
            }

            if (clipHistory.Count == 0)
            {
                clipHistory.Add("import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello SmartPaste Pro!\");\n    }\n}");
                clipHistory.Add("function solve() {\n  console.log('SmartPaste Pro active');\n}");
            }

            RefreshClipList();
        }

        private void RefreshClipList()
        {
            lstClips.Items.Clear();
            foreach (string c in clipHistory)
            {
                string firstLine = c.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0];
                if (firstLine.Length > 60) firstLine = firstLine.Substring(0, 57) + "...";
                lstClips.Items.Add(string.Format("[{0} chars] {1}", c.Length, firstLine));
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            base.OnFormClosing(e);
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
