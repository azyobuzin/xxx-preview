variable "TAG" {
  default = "azyobuzin/xxx-preview:latest"
}

group "default" {
    targets = ["test", "production"]
}

target "test" {
    target = "test"
    output = [{ type = "cacheonly" }]
}

target "production" {
    target = "production"
    tags = [TAG]
}
