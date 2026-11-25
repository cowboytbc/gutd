namespace GUTDManager;

public partial class AppShell : Shell
{
	public AppShell()
	{
		InitializeComponent();
		Routing.RegisterRoute("feature", typeof(FeaturePage));
	}
}
