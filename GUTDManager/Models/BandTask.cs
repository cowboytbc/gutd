using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace GUTDManager.Models;

[Table("band_tasks")]
public class BandTask : BaseModel
{
	[PrimaryKey("id", false)]
	public Guid Id { get; set; }

	[Column("band_id")]
	public Guid BandId { get; set; }

	[Column("title")]
	public string Title { get; set; } = string.Empty;

	[Column("details")]
	public string Details { get; set; } = string.Empty;

	[Column("due_at")]
	public DateTime? DueAt { get; set; }

	[Column("status")]
	public string Status { get; set; } = "open";
}
