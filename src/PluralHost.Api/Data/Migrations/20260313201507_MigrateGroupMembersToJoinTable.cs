using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MigrateGroupMembersToJoinTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Members_Groups_GroupId",
                table: "Members");

            migrationBuilder.DropIndex(
                name: "IX_Members_GroupId",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "Members");

            migrationBuilder.AddColumn<string>(
                name: "Emoji",
                table: "Groups",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MemberGroups",
                columns: table => new
                {
                    GroupsId = table.Column<Guid>(type: "TEXT", nullable: false),
                    MembersId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberGroups", x => new { x.GroupsId, x.MembersId });
                    table.ForeignKey(
                        name: "FK_MemberGroups_Groups_GroupsId",
                        column: x => x.GroupsId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MemberGroups_Members_MembersId",
                        column: x => x.MembersId,
                        principalTable: "Members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MemberGroups_MembersId",
                table: "MemberGroups",
                column: "MembersId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MemberGroups");

            migrationBuilder.DropColumn(
                name: "Emoji",
                table: "Groups");

            migrationBuilder.AddColumn<Guid>(
                name: "GroupId",
                table: "Members",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Members_GroupId",
                table: "Members",
                column: "GroupId");

            migrationBuilder.AddForeignKey(
                name: "FK_Members_Groups_GroupId",
                table: "Members",
                column: "GroupId",
                principalTable: "Groups",
                principalColumn: "Id");
        }
    }
}
