namespace GUTDManager;

public partial class MainPage : ContentPage
{
	public MainPage()
	{
		InitializeComponent();
	}

	private async void OpenFeature(string title)
	{
		await Shell.Current.GoToAsync($"feature?title={Uri.EscapeDataString(title)}");
	}

	private void OnAddEvent(object? sender, EventArgs e) => OpenFeature("Calendar");
	private void OnChat(object? sender, EventArgs e) => OpenFeature("Chat");
	private void OnCalendar(object? sender, EventArgs e) => OpenFeature("Calendar");
	private void OnTasks(object? sender, EventArgs e) => OpenFeature("Tasks");
	private void OnSetlists(object? sender, EventArgs e) => OpenFeature("Setlists");
	private void OnMerch(object? sender, EventArgs e) => OpenFeature("Merch");
	private void OnFans(object? sender, EventArgs e) => OpenFeature("Fan Updates");
	private void OnContacts(object? sender, EventArgs e) => OpenFeature("Contacts");
	private void OnContent(object? sender, EventArgs e) => OpenFeature("Content Calendar");
	private void OnFiles(object? sender, EventArgs e) => OpenFeature("Files");
	private void OnExpenses(object? sender, EventArgs e) => OpenFeature("Expenses");
	private void OnManager(object? sender, EventArgs e) => OpenFeature("AI Manager");
}
