using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPrivacyBuckets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PrivacyBuckets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Emoji = table.Column<string>(type: "TEXT", maxLength: 10, nullable: true),
                    Color = table.Column<string>(type: "TEXT", nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    IsDefault = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrivacyBuckets", x => x.Id);
                });

            // Seed the 4 default buckets with fixed GUIDs
            migrationBuilder.Sql(@"
    INSERT INTO ""PrivacyBuckets""
        (""Id"", ""Name"", ""Description"", ""Emoji"", ""Color"", ""SortOrder"", ""IsDefault"",
         ""DeletedAt"", ""CreatedAt"", ""UpdatedAt"")
    VALUES
        ('00000000-0000-0000-0000-000000000001', 'Public',  'Visible to everyone',           '🌐', NULL, 0, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('00000000-0000-0000-0000-000000000002', 'Friend',  'Visible to friends',            '🤝', NULL, 1, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('00000000-0000-0000-0000-000000000003', 'Trusted', 'Visible to trusted people',     '💛', NULL, 2, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('00000000-0000-0000-0000-000000000004', 'Private', 'Never visible to token holders','🔒', NULL, 3, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
");

            migrationBuilder.AddColumn<Guid>(
                name: "BucketId",
                table: "Members",
                type: "TEXT",
                nullable: true);

            // Map existing PrivacyTier enum values to bucket GUIDs
            migrationBuilder.Sql(@"
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000001' WHERE ""PrivacyTier"" = 0 OR ""PrivacyTier"" IS NULL;
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000002' WHERE ""PrivacyTier"" = 1;
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000003' WHERE ""PrivacyTier"" = 2;
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000004' WHERE ""PrivacyTier"" = 3;
");

            migrationBuilder.AddColumn<int>(
                name: "MinBucketSortOrder",
                table: "AccessTokens",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Map existing TokenPermission enum values to MinBucketSortOrder
            migrationBuilder.Sql(@"
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" = -1 WHERE ""Permission"" = 0;
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" =  0 WHERE ""Permission"" = 1;
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" =  1 WHERE ""Permission"" = 2;
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" =  2 WHERE ""Permission"" = 3;
");

            migrationBuilder.CreateIndex(
                name: "IX_Members_BucketId",
                table: "Members",
                column: "BucketId");

            migrationBuilder.AddForeignKey(
                name: "FK_Members_PrivacyBuckets_BucketId",
                table: "Members",
                column: "BucketId",
                principalTable: "PrivacyBuckets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Members_PrivacyBuckets_BucketId",
                table: "Members");

            migrationBuilder.DropTable(
                name: "PrivacyBuckets");

            migrationBuilder.DropIndex(
                name: "IX_Members_BucketId",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "BucketId",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "MinBucketSortOrder",
                table: "AccessTokens");
        }
    }
}
