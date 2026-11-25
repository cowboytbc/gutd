using Microsoft.Extensions.Logging;
using GUTDManager.Services;

namespace GUTDManager;

public static class MauiProgram
{
	public static MauiApp CreateMauiApp()
	{
		var builder = MauiApp.CreateBuilder();
		builder
			.UseMauiApp<App>()
			.Services.AddSingleton<BandBackend>();
		builder.Services.AddTransient<FeaturePage>();
		builder.Services.AddLogging(logging =>
		{
			logging.AddDebug();
		});

		builder
			.ConfigureFonts(fonts =>
			{
				fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
				fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
			});

		return builder.Build();
	}
}
