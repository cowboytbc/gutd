using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace GUTDManager.Models;

[Table("band_messages")]
public class BandMessage : BaseModel
{
	[PrimaryKey("id", false)]
	public long Id { get; set; }

	[Column("band_id")]
	public Guid BandId { get; set; }

	[Column("sender_id")]
	public string SenderId { get; set; } = string.Empty;

	[Column("sender_email")]
	public string SenderEmail { get; set; } = string.Empty;

	[Column("body")]
	public string Body { get; set; } = string.Empty;

	[Column("created_at")]
	public DateTime CreatedAt { get; set; }
}
