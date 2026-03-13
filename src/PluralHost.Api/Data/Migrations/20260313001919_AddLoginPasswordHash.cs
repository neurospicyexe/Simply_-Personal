using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLoginPasswordHash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LoginPasswordHash",
                table: "SystemSettings",
                type: "TEXT",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "SystemSettings",
                keyColumn: "Id",
                keyValue: 1,
                column: "LoginPasswordHash",
                value: null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LoginPasswordHash",
                table: "SystemSettings");
        }
    }
}
