FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/PluralHost.Api/PluralHost.Api.csproj", "src/PluralHost.Api/"]
RUN dotnet restore "src/PluralHost.Api/PluralHost.Api.csproj"
COPY . .
RUN dotnet publish "src/PluralHost.Api/PluralHost.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app

# Data directory for SQLite and secure uploads
RUN mkdir -p /app/data /app/secure_uploads

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "PluralHost.Api.dll"]
