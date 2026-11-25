using System.Collections.ObjectModel;
using GUTDManager.Models;
using GUTDManager.Services;

namespace GUTDManager;

[QueryProperty(nameof(SectionTitle), "title")]
public partial class FeaturePage : ContentPage
{
	private readonly ObservableCollection<string> _items = new();
	private readonly ObservableCollection<BandMessage> _messages = new();
	private readonly ObservableCollection<BandEvent> _events = new();
	private readonly ObservableCollection<BandTask> _tasks = new();
	private readonly ObservableCollection<BandManagerSource> _managerSources = new();
	private readonly BandBackend _backend;
	private bool _hasBand;

	public FeaturePage()
	{
		_backend = (Application.Current as App)?.BandBackend
			?? throw new InvalidOperationException("The band backend service is not registered.");
		InitializeComponent();
		ItemsView.ItemsSource = _items;
		MessagesView.ItemsSource = _messages;
		EventsView.ItemsSource = _events;
		TasksView.ItemsSource = _tasks;
		BindableLayout.SetItemsSource(ManagerSourcesLayout, _managerSources);
		_backend.MessageReceived += OnMessageReceived;
	}

	protected override async void OnAppearing()
	{
		base.OnAppearing();
		TitleLabel.Text = _sectionTitle ?? base.Title;
		UpdateSectionVisibility();
		if (!IsChat && !IsCalendar && !IsTasks && !IsManager)
			return;

		try
		{
			await _backend.InitializeAsync();
			if (IsChat)
			{
				await UpdateChatStateAsync();
				return;
			}

			_hasBand = _backend.IsSignedIn && await _backend.GetCurrentBandIdAsync() is not null;
			UpdateSectionVisibility();
			if (IsCalendar && _hasBand)
				await LoadEventsAsync();
			else if (IsTasks && _hasBand)
				await LoadTasksAsync();
		}
		catch (Exception ex)
		{
			SignInRequiredPanel.IsVisible = true;
			WorkspaceStatusLabel.Text = $"Backend request failed: {ex.Message}";
		}
	}

	private string? _sectionTitle;
	public string? SectionTitle
	{
		get => _sectionTitle;
		set
		{
			_sectionTitle = Uri.UnescapeDataString(value ?? "Workspace");
			TitleLabel.Text = _sectionTitle;
			UpdateSectionVisibility();
		}
	}

	private string CurrentSection => _sectionTitle ?? base.Title;
	private bool IsChat => string.Equals(CurrentSection, "Chat", StringComparison.OrdinalIgnoreCase);
	private bool IsCalendar => string.Equals(CurrentSection, "Calendar", StringComparison.OrdinalIgnoreCase);
	private bool IsTasks => string.Equals(CurrentSection, "Tasks", StringComparison.OrdinalIgnoreCase);
	private bool IsManager => string.Equals(CurrentSection, "AI Manager", StringComparison.OrdinalIgnoreCase);

	private void UpdateSectionVisibility()
	{
		var chat = IsChat;
		var calendar = IsCalendar;
		var tasks = IsTasks;
		var manager = IsManager;
		var dataSection = calendar || tasks || manager;
		ItemsView.IsVisible = !chat && !dataSection;
		ItemEntryPanel.IsVisible = !chat && !dataSection;
		AuthPanel.IsVisible = chat && !_backend.IsSignedIn;
		SetupPanel.IsVisible = chat && _backend.IsSignedIn && !_hasBand;
		ChatPanel.IsVisible = chat && _backend.IsSignedIn && _hasBand;
		CalendarPanel.IsVisible = calendar && _backend.IsSignedIn && _hasBand;
		TasksPanel.IsVisible = tasks && _backend.IsSignedIn && _hasBand;
		ManagerPanel.IsVisible = manager && _backend.IsSignedIn && _hasBand;
		SignInRequiredPanel.IsVisible = dataSection && (!_backend.IsSignedIn || !_hasBand);
	}

	private void OnAddItem(object? sender, EventArgs e)
	{
		if (string.IsNullOrWhiteSpace(NewItemEntry.Text))
			return;

		_items.Add(NewItemEntry.Text.Trim());
		NewItemEntry.Text = string.Empty;
	}

	private async void OnSignIn(object? sender, EventArgs e)
	{
		await AuthenticateAsync(signUp: false);
	}

	private async void OnSignUp(object? sender, EventArgs e)
	{
		await AuthenticateAsync(signUp: true);
	}

	private async Task AuthenticateAsync(bool signUp)
	{
		var email = EmailEntry.Text?.Trim() ?? string.Empty;
		var password = PasswordEntry.Text ?? string.Empty;
		if (string.IsNullOrWhiteSpace(email) || password.Length < 6)
		{
			AuthStatusLabel.Text = "Enter your email and a password of at least 6 characters.";
			return;
		}

		try
		{
			if (signUp)
			{
				await _backend.SignUpAsync(email, password);
				AuthStatusLabel.Text = "Account created. If email confirmation is enabled, verify your email, then sign in.";
				if (!_backend.IsSignedIn)
					return;
			}
			else
			{
				await _backend.SignInAsync(email, password);
			}

			await UpdateChatStateAsync();
		}
		catch (Exception ex)
		{
			AuthStatusLabel.Text = ex.Message;
		}
	}

	private async Task UpdateChatStateAsync()
	{
		if (!_backend.IsSignedIn)
		{
			_hasBand = false;
			UpdateSectionVisibility();
			return;
		}

		_hasBand = await _backend.GetCurrentBandIdAsync() is not null;
		UpdateSectionVisibility();
		if (!_hasBand)
			return;

		var messages = await _backend.LoadMessagesAsync();
		_messages.Clear();
		foreach (var message in messages)
			_messages.Add(message);

		await _backend.SubscribeToMessagesAsync();
	}

	private async Task LoadEventsAsync()
	{
		var events = await _backend.LoadEventsAsync();
		_events.Clear();
		foreach (var item in events)
			_events.Add(item);
	}

	private async Task LoadTasksAsync()
	{
		var tasks = await _backend.LoadTasksAsync();
		_tasks.Clear();
		foreach (var item in tasks)
			_tasks.Add(item);
	}

	private async void OnAddEvent(object? sender, EventArgs e)
	{
		var title = EventTitleEntry.Text?.Trim() ?? string.Empty;
		if (string.IsNullOrWhiteSpace(title))
			return;

		try
		{
			var startsAt = DateTime.SpecifyKind(
				(EventDatePicker.Date ?? DateTime.Today).Date + (EventTimePicker.Time ?? TimeSpan.Zero),
				DateTimeKind.Local);
			await _backend.CreateEventAsync(title, startsAt, EventLocationEntry.Text ?? string.Empty);
			EventTitleEntry.Text = string.Empty;
			EventLocationEntry.Text = string.Empty;
			await LoadEventsAsync();
		}
		catch (Exception ex)
		{
			await DisplayAlertAsync("Could not save event", ex.Message, "OK");
		}
	}

	private async void OnAddTask(object? sender, EventArgs e)
	{
		var title = TaskTitleEntry.Text?.Trim() ?? string.Empty;
		if (string.IsNullOrWhiteSpace(title))
			return;

		try
		{
			await _backend.CreateTaskAsync(title, (TaskDuePicker.Date ?? DateTime.Today).Date);
			TaskTitleEntry.Text = string.Empty;
			await LoadTasksAsync();
		}
		catch (Exception ex)
		{
			await DisplayAlertAsync("Could not save task", ex.Message, "OK");
		}
	}

	private async void OnToggleTask(object? sender, EventArgs e)
	{
		if (sender is not Button { BindingContext: BandTask task })
			return;

		try
		{
			await _backend.ToggleTaskAsync(task);
			await LoadTasksAsync();
		}
		catch (Exception ex)
		{
			await DisplayAlertAsync("Could not update task", ex.Message, "OK");
		}
	}

	private async void OnAskManager(object? sender, EventArgs e)
	{
		var question = ManagerQuestionEntry.Text?.Trim() ?? string.Empty;
		if (string.IsNullOrWhiteSpace(question))
		{
			ManagerStatusLabel.Text = "Enter a question first.";
			return;
		}

		if (WebResearchSwitch.IsToggled)
		{
			var confirmed = await DisplayAlertAsync(
				"Use paid web research?",
				"Gemini Search grounding may incur Google API charges. Continue with this request?",
				"Continue",
				"Cancel");
			if (!confirmed)
				return;
		}

		try
		{
			AskManagerButton.IsEnabled = false;
			ManagerStatusLabel.Text = "Thinking...";
			ManagerAnswerLabel.Text = string.Empty;
			_managerSources.Clear();

			var result = await _backend.AskBandManagerAsync(question, WebResearchSwitch.IsToggled);
			ManagerAnswerLabel.Text = result.Answer;
			foreach (var source in result.Sources)
				_managerSources.Add(source);
			ManagerStatusLabel.Text = result.UsedWebResearch
				? "Live web research was enabled for this request. Verify sources before acting."
				: "Suggestions only; nothing was changed or sent.";
		}
		catch (Exception ex)
		{
			ManagerStatusLabel.Text = $"AI request failed: {ex.Message}";
		}
		finally
		{
			AskManagerButton.IsEnabled = true;
		}
	}

	private async void OnOpenManagerSource(object? sender, EventArgs e)
	{
		if (sender is not Button { BindingContext: BandManagerSource source })
			return;

		if (Uri.TryCreate(source.Url, UriKind.Absolute, out var uri)
			&& (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp))
		{
			await Launcher.Default.OpenAsync(uri);
		}
	}

	private async void OnCreateBand(object? sender, EventArgs e)
	{
		var name = BandNameEntry.Text?.Trim() ?? string.Empty;
		if (string.IsNullOrWhiteSpace(name))
		{
			SetupStatusLabel.Text = "Enter a band name.";
			return;
		}

		try
		{
			await _backend.CreateBandAsync(name);
			SetupStatusLabel.Text = string.Empty;
			await UpdateChatStateAsync();
		}
		catch (Exception ex)
		{
			SetupStatusLabel.Text = ex.Message;
		}
	}

	private async void OnJoinBand(object? sender, EventArgs e)
	{
		var code = InviteCodeEntry.Text?.Trim() ?? string.Empty;
		if (string.IsNullOrWhiteSpace(code))
		{
			SetupStatusLabel.Text = "Enter the invite code from a band manager.";
			return;
		}

		try
		{
			await _backend.JoinBandAsync(code);
			SetupStatusLabel.Text = string.Empty;
			await UpdateChatStateAsync();
		}
		catch (Exception ex)
		{
			SetupStatusLabel.Text = ex.Message;
		}
	}

	private async void OnCreateInvite(object? sender, EventArgs e)
	{
		try
		{
			var code = await _backend.CreateInviteAsync();
			await DisplayAlertAsync("Band invite", $"Share this code with a band member: {code}", "OK");
		}
		catch (Exception ex)
		{
			await DisplayAlertAsync("Could not create invite", ex.Message, "OK");
		}
	}

	private async void OnSendMessage(object? sender, EventArgs e)
	{
		var message = MessageEntry.Text?.Trim();
		if (string.IsNullOrWhiteSpace(message))
			return;

		try
		{
			await _backend.SendMessageAsync(message);
			MessageEntry.Text = string.Empty;
		}
		catch (Exception ex)
		{
			await DisplayAlertAsync("Could not send message", ex.Message, "OK");
		}
	}

	private async void OnSignOut(object? sender, EventArgs e)
	{
		try
		{
			await _backend.SignOutAsync();
			_messages.Clear();
			UpdateSectionVisibility();
		}
		catch (Exception ex)
		{
			await DisplayAlertAsync("Could not sign out", ex.Message, "OK");
		}
	}

	private void OnMessageReceived(object? sender, BandMessage message)
	{
		MainThread.BeginInvokeOnMainThread(() =>
		{
			if (_messages.All(existing => existing.Id != message.Id))
				_messages.Add(message);
		});
	}
}
