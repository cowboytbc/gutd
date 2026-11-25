using System.Text.Json.Serialization;

namespace GUTDManager.Models;

public sealed class BandManagerReply
{
	[JsonPropertyName("answer")]
	public string Answer { get; set; } = string.Empty;

	[JsonPropertyName("sources")]
	public List<BandManagerSource> Sources { get; set; } = [];

	[JsonPropertyName("usedWebResearch")]
	public bool UsedWebResearch { get; set; }
}

public sealed class BandManagerSource
{
	[JsonPropertyName("title")]
	public string Title { get; set; } = string.Empty;

	[JsonPropertyName("url")]
	public string Url { get; set; } = string.Empty;
}
