using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MemberEnrichment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Note",
                table: "FrontHistory",
                newName: "CustomStatusId");

            migrationBuilder.AddColumn<string>(
                name: "ExtraImages",
                table: "Members",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsUntracked",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "PreventFrontNotification",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ReceiveBoardNotifications",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SpMemberId",
                table: "Members",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Comment",
                table: "FrontHistory",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BoardMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    MemberId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AuthorName = table.Column<string>(type: "TEXT", nullable: false),
                    Content = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardMessages_Members_MemberId",
                        column: x => x.MemberId,
                        principalTable: "Members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FrontStatuses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    Color = table.Column<string>(type: "TEXT", nullable: true),
                    IsDefault = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsHidden = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FrontStatuses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MemberNotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    MemberId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", nullable: true),
                    Content = table.Column<string>(type: "TEXT", nullable: false),
                    IsPinned = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsLocked = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MemberNotes_Members_MemberId",
                        column: x => x.MemberId,
                        principalTable: "Members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "FrontStatuses",
                columns: new[] { "Id", "Color", "CreatedAt", "DeletedAt", "IsDefault", "IsHidden", "Label", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("a1000000-0000-0000-0000-000000000001"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Co-con", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000002"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Blending", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000003"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Switching", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000004"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Stressed", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000005"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Dissociating", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000006"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Foggy", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000007"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Passive influence", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000008"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Full switch", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000009"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Partial switch", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("a1000000-0000-0000-0000-000000000010"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, false, "Fronting alone", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_FrontHistory_CustomStatusId",
                table: "FrontHistory",
                column: "CustomStatusId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardMessages_MemberId",
                table: "BoardMessages",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_MemberNotes_MemberId",
                table: "MemberNotes",
                column: "MemberId");

            migrationBuilder.AddForeignKey(
                name: "FK_FrontHistory_FrontStatuses_CustomStatusId",
                table: "FrontHistory",
                column: "CustomStatusId",
                principalTable: "FrontStatuses",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FrontHistory_FrontStatuses_CustomStatusId",
                table: "FrontHistory");

            migrationBuilder.DropTable(
                name: "BoardMessages");

            migrationBuilder.DropTable(
                name: "FrontStatuses");

            migrationBuilder.DropTable(
                name: "MemberNotes");

            migrationBuilder.DropIndex(
                name: "IX_FrontHistory_CustomStatusId",
                table: "FrontHistory");

            migrationBuilder.DropColumn(
                name: "ExtraImages",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "IsPinned",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "IsUntracked",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "PreventFrontNotification",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "ReceiveBoardNotifications",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "SpMemberId",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "Comment",
                table: "FrontHistory");

            migrationBuilder.RenameColumn(
                name: "CustomStatusId",
                table: "FrontHistory",
                newName: "Note");
        }
    }
}
