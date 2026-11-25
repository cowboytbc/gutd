using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace GUTDManager.Models;

[Table("band_events")]
public class BandEvent : BaseModel
{
	[PrimaryKey("id", false)]
	public Guid Id { get; set; }

	[Column("band_id")]
	public Guid BandId { get; set; }

	[Column("title")]
	public string Title { get; set; } = string.Empty;

	[Column("starts_at")]
	public DateTime StartsAt { get; set; }

	[Column("location")]
	public string Location { get; set; } = string.Empty;

	[Column("notes")]
	public string Notes { get; set; } = string.Empty;
}
