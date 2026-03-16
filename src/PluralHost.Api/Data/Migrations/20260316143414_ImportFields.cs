using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ImportFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Birthday",
                table: "Members",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PkId",
                table: "Members",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpFieldId",
                table: "CustomFields",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Birthday",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "PkId",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "SpFieldId",
                table: "CustomFields");
        }
    }
}
