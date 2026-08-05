const toolConfig =
require("../config/toolConfig");

function checkPermission(
    toolName,
    context
){

    if(context.identity.isAdmin){

        return true;

    }

    const config =
        toolConfig[toolName];

    if(!config){

        return false;

    }

    // temporary

    return true;

}

module.exports={
checkPermission
};