using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace GUTDManager.Models;

[Table("band_invites")]
public class BandInvite : BaseModel
{
	[PrimaryKey("id", false)]
	public Guid Id { get; set; }

	[Column("band_id")]
	public Guid BandId { get; set; }

	[Column("invite_code")]
	public string InviteCode { get; set; } = string.Empty;

	[Column("created_by")]
	public string CreatedBy { get; set; } = string.Empty;
}
