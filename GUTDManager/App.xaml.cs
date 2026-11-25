using Microsoft.Extensions.DependencyInjection;
using GUTDManager.Services;

namespace GUTDManager;

public partial class App : Application
{
	public App(BandBackend bandBackend)
	{
		BandBackend = bandBackend;
		InitializeComponent();
	}

	public BandBackend BandBackend { get; }

	protected override Window CreateWindow(IActivationState? activationState)
	{
		return new Window(new AppShell());
	}
}